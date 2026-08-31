// One-off backfill after switching search_index.search_vector from 'english' to 'simple'
// config (see lib/search/index-page.ts) — 'english' stripped stop words, so existing rows
// need rebuilding to match the new query-side config. Idempotent; safe to re-run.
//
// Usage: pnpm tsx scripts/reindex-search-simple-config.ts

import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";

if (existsSync(".env")) {
  process.loadEnvFile();
}

async function main() {
  const [{ db }, { pages }, { upsertPageSearchIndex }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
    import("@/lib/search/index-page"),
  ]);

  const allPages = await db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      title: pages.title,
      kind: pages.kind,
    })
    .from(pages)
    .where(eq(pages.isDeleted, false));

  let count = 0;
  for (const page of allPages) {
    await upsertPageSearchIndex(db, page);
    count++;
  }

  console.log(
    `Reindexed ${count} page(s) with the 'simple' text-search config.`
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
