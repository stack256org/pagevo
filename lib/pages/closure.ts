// ALL parent_id mutations must go through these functions — never update parent_id directly.
// Skipping this corrupts the entire page hierarchy and all permission checks that depend on it.

import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { pages } from "@/lib/db/schema";

export async function insertPageWithClosure(
  tx: Tx,
  pageId: string,
  parentId: string | null
): Promise<void> {
  // Self-referencing row (every node is its own ancestor at depth 0)
  await tx.execute(
    sql`INSERT INTO page_closure (ancestor_id, descendant_id, depth)
        VALUES (${pageId}::uuid, ${pageId}::uuid, 0)`
  );

  if (parentId) {
    // Inherit all ancestor rows from parent, incremented by 1
    await tx.execute(
      sql`INSERT INTO page_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, ${pageId}::uuid, depth + 1
          FROM page_closure
          WHERE descendant_id = ${parentId}::uuid`
    );
  }
}

export async function movePageWithClosure(
  tx: Tx,
  pageId: string,
  newParentId: string | null
): Promise<void> {
  // Remove all paths that enter the subtree from outside
  await tx.execute(
    sql`DELETE FROM page_closure
        WHERE descendant_id IN (
          SELECT descendant_id FROM page_closure WHERE ancestor_id = ${pageId}::uuid
        )
        AND ancestor_id NOT IN (
          SELECT descendant_id FROM page_closure WHERE ancestor_id = ${pageId}::uuid
        )`
  );

  if (newParentId) {
    // Reconnect: cross-join new parent's ancestors with the subtree
    await tx.execute(
      sql`INSERT INTO page_closure (ancestor_id, descendant_id, depth)
          SELECT supertree.ancestor_id,
                 subtree.descendant_id,
                 supertree.depth + subtree.depth + 1
          FROM page_closure AS supertree
          CROSS JOIN page_closure AS subtree
          WHERE supertree.descendant_id = ${newParentId}::uuid
            AND subtree.ancestor_id     = ${pageId}::uuid`
    );
  }
}

// No-op: ON DELETE CASCADE on page_closure FKs handles physical deletion automatically.
export async function deletePageClosure(
  _tx: Tx,
  _pageId: string
): Promise<void> {}

// Create a page row and wire it into the closure table in one transaction step.
// Used by API routes that need to create database/entry pages.
export async function createPageWithClosure(
  tx: Tx,
  opts: {
    workspaceId: string;
    title: string;
    kind: "page" | "database" | "entry";
    parentId: string | null;
    databaseId?: string | null;
    createdBy: string;
  }
): Promise<typeof pages.$inferSelect> {
  const { workspaceId, title, kind, parentId, databaseId, createdBy } = opts;

  // Compute next orderIndex among siblings
  const [{ maxIdx }] = await tx
    .select({ maxIdx: max(pages.orderIndex) })
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, workspaceId),
        eq(pages.isDeleted, false),
        parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId)
      )
    );

  const shortId = createId().slice(0, 10);
  const orderIndex = (maxIdx ?? -1) + 1;

  const [page] = await tx
    .insert(pages)
    .values({
      shortId,
      workspaceId,
      title,
      kind,
      parentId,
      databaseId: databaseId ?? null,
      orderIndex,
      createdBy,
      lastEditedBy: createdBy,
    })
    .returning();

  await insertPageWithClosure(tx, page.id, parentId);
  return page;
}
