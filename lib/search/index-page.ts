import { eq, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { searchIndex } from "@/lib/db/schema";

// Upserts a page/entry record into search_index.
// Accepts the main db instance or a transaction (both expose .insert/.delete).
export async function upsertPageSearchIndex(
  dbOrTx: Pick<typeof db, "insert" | "delete">,
  page: {
    id: string;
    workspaceId: string;
    title: string | null;
    kind: string;
  }
) {
  const title = page.title ?? "Untitled";
  // A database row (kind "entry") is searched/filtered as an "entry"; everything
  // else (kind "page" or "database") as a "page". Previously this was hardcoded
  // to "page", so the search "Entries" type filter never matched anything and
  // "Pages" returned entries too — the type filter was effectively a no-op.
  const sourceType = page.kind === "entry" ? "entry" : "page";

  // Delete-then-insert (not upsert) because sourceId alone is the key: if kind ever changes, an upsert on
  // (sourceType, sourceId) would leave a stale differently-typed row behind.
  await dbOrTx.delete(searchIndex).where(eq(searchIndex.sourceId, page.id));
  await dbOrTx.insert(searchIndex).values({
    workspaceId: page.workspaceId,
    sourceType,
    sourceId: page.id,
    pageId: page.id,
    title,
    // 'simple' not 'english' — 'english' drops stop words to zero lexemes (e.g. "JUst" indexed nothing).
    // Titles are short identifiers, not prose; prefix matching already covers most of what stemming would.
    searchVector: sql`to_tsvector('simple', ${title})`,
  });
}
