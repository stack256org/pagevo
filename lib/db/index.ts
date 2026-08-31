import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Use globalThis to survive Next.js hot-reloads in dev without leaking connections.
const globalForDb = globalThis as unknown as { _pgClient?: postgres.Sql };

const client =
  globalForDb._pgClient ?? postgres(env.DATABASE_URL, { prepare: false });
if (process.env.NODE_ENV !== "production") {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema, casing: "snake_case" });
export type DB = typeof db;

// The transaction handle drizzle hands to a db.transaction(cb) callback. Shared
// so helpers that must run inside a caller's transaction can type their `tx`.
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Raw client for query-template usage (e.g. queue inspection)
export { client as dbClient };
