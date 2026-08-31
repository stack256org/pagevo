import { existsSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const MIGRATIONS_TABLE = `"drizzle"."__drizzle_migrations"`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const [lastDbMigration] = await sql.unsafe(
    `select created_at from ${MIGRATIONS_TABLE} order by created_at desc limit 1`
  );

  let applied = 0;
  for (const migration of migrations) {
    if (
      lastDbMigration &&
      Number(lastDbMigration.created_at) >= migration.folderMillis
    ) {
      continue;
    }

    // Each migration commits in its own transaction: Postgres forbids using a value
    // added via ALTER TYPE ... ADD VALUE in the same transaction that added it
    // (migration 0008 uses an enum value 0003 adds), which breaks drizzle's default single-transaction migrator.
    await sql.begin(async (tx) => {
      for (const stmt of migration.sql) {
        if (stmt.trim()) {
          await tx.unsafe(stmt);
        }
      }
      await tx.unsafe(
        `insert into ${MIGRATIONS_TABLE} (hash, created_at) values ($1, $2)`,
        [migration.hash, migration.folderMillis]
      );
    });
    applied++;
    console.log(
      `Applied migration: ${migration.hash.slice(0, 12)} (${new Date(migration.folderMillis).toISOString()})`
    );
  }

  console.log(
    applied === 0
      ? "No pending migrations."
      : `Applied ${applied} migration(s).`
  );
  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
