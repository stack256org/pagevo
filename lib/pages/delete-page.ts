import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageClosure, pages, userFavorites } from "@/lib/db/schema";
import { triggerPageDeletedNotification } from "@/lib/notifications/triggers";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError } from "@/lib/workspaces/auth";

export type DeletePageResult = { deleted: "permanent" | "soft" };

// Shared cascade logic for single and bulk page delete: not-in-trash → soft delete, already-trashed → hard delete.
// Databases used to be hard-deleted on first delete (destroying entries via cascade); they now soft-delete like any page.
export async function deletePageCascade(
  pageId: string,
  userId: string
): Promise<DeletePageResult> {
  const [page] = await db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      isDeleted: pages.isDeleted,
      kind: pages.kind,
      createdBy: pages.createdBy,
      title: pages.title,
      isDraft: pages.isDraft,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);

  if (!page) {
    throw new ApiError(404, "Page not found");
  }

  await requirePagePermission(userId, pageId, "can_edit");

  // Only an already-trashed page is destroyed for real — that's the explicit
  // "delete forever" action from the Trash screen.
  if (page.isDeleted) {
    await db.delete(pages).where(eq(pages.id, pageId));
    return { deleted: "permanent" };
  }

  const descendants = await db
    .select({ descendantId: pageClosure.descendantId })
    .from(pageClosure)
    .where(eq(pageClosure.ancestorId, pageId));

  const descendantIds = descendants.map((d) => d.descendantId);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(pages)
      .set({
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
      })
      .where(inArray(pages.id, descendantIds));

    // Soft delete doesn't remove the row, so ON DELETE CASCADE never fires; clear favorites explicitly.
    // Deliberately permanent — restoring the page should NOT bring it back into anyone's Favorites.
    await tx
      .delete(userFavorites)
      .where(inArray(userFavorites.pageId, descendantIds));

    // Notify the creator their page was trashed; skipped when deleting your own page, or for still-draft pages
    // (which collaborators were never told about) to avoid leaking their existence.
    if (page.createdBy && !page.isDraft) {
      await triggerPageDeletedNotification(tx, {
        workspaceId: page.workspaceId,
        pageId: page.id,
        deletedBy: userId,
        createdBy: page.createdBy,
        pageTitle: page.title ?? "Untitled",
      });
    }
  });

  return { deleted: "soft" };
}
