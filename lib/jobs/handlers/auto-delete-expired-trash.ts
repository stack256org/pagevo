import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { pageClosure, pages } from "@/lib/db/schema";

// Runs daily at 02:00 UTC.
// Permanently deletes pages where is_deleted = true and deleted_at > 30 days ago.
// Cascades to all descendants. ON DELETE CASCADE on blocks and page_closure handles cleanup.
export async function handleAutoDeleteExpiredTrash(
  _jobs: Job<Record<string, never>>[]
) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Find all root-level expired trash pages (not descendants of another deleted page —
  // they'll be caught via ON DELETE CASCADE).
  const expiredRoots = await db
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages.isDeleted, true),
        lt(pages.deletedAt, cutoff),
        // Only roots: parentId is null or parent is not deleted
        sql`(${pages.parentId} IS NULL OR NOT EXISTS (
          SELECT 1 FROM pages p2
          WHERE p2.id = ${pages.parentId}
          AND p2.is_deleted = true
          AND p2.deleted_at < ${cutoff}
        ))`
      )
    );

  if (expiredRoots.length === 0) {
    return;
  }

  const rootIds = expiredRoots.map((p) => p.id);

  // Collect all descendants via closure table
  const allDescendants = await db
    .select({ descendantId: pageClosure.descendantId })
    .from(pageClosure)
    .where(inArray(pageClosure.ancestorId, rootIds));

  const allIds = [...new Set(allDescendants.map((d) => d.descendantId))];

  // Hard delete — ON DELETE CASCADE removes blocks, page_closure, page_versions
  await db.delete(pages).where(inArray(pages.id, allIds));

  console.log(
    `[auto-delete-expired-trash] Permanently deleted ${allIds.length} pages.`
  );
}
