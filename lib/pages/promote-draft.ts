import { and, eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { triggerPageCreatedNotification } from "@/lib/notifications/triggers";

// Shared promote-draft logic for the rename and autosave routes; the `WHERE isDraft = true` guard makes it
// race-safe so only one concurrent caller promotes/notifies. Bumping updatedAt alone is enough for the SSE poll to notice.
export async function promoteDraftPage(
  tx: Tx,
  pageId: string
): Promise<{ promoted: boolean; page?: typeof pages.$inferSelect }> {
  const [promoted] = await tx
    .update(pages)
    .set({ isDraft: false })
    .where(and(eq(pages.id, pageId), eq(pages.isDraft, true)))
    .returning();

  if (!promoted) {
    return { promoted: false };
  }

  if (promoted.createdBy) {
    await triggerPageCreatedNotification(tx, {
      workspaceId: promoted.workspaceId,
      pageId: promoted.id,
      creatorId: promoted.createdBy,
      pageTitle: promoted.title,
      isPrivate: promoted.isPrivate,
      kind: promoted.kind,
      isDraft: false,
    });
  }

  return { promoted: true, page: promoted };
}
