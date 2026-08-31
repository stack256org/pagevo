import { and, eq, gt, lt } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { triggerTrashWarningNotification } from "@/lib/notifications/triggers";

// Runs daily at 02:00 UTC.
// Finds pages 3 days from permanent deletion (day 27–30 of Trash) that haven't been warned yet,
// atomically marks trash_warning_sent = true, then fires in-app notifications.
export async function handleWarnExpiringTrash(
  _jobs: Job<Record<string, never>>[]
) {
  const now = new Date();
  const day27 = new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const expiring = await db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      deletedBy: pages.deletedBy,
      createdBy: pages.createdBy,
      title: pages.title,
    })
    .from(pages)
    .where(
      and(
        eq(pages.isDeleted, true),
        eq(pages.trashWarningSent, false),
        lt(pages.deletedAt, day27),
        gt(pages.deletedAt, day30)
      )
    );

  if (expiring.length === 0) {
    return;
  }

  for (const page of expiring) {
    await db.transaction(async (tx) => {
      // Guarded UPDATE — prevents duplicate warnings on concurrent runs
      const [updated] = await tx
        .update(pages)
        .set({ trashWarningSent: true })
        .where(and(eq(pages.id, page.id), eq(pages.trashWarningSent, false)))
        .returning({ id: pages.id });

      if (!updated) {
        return; // Another concurrent run already handled this page
      }

      await triggerTrashWarningNotification(tx, {
        workspaceId: page.workspaceId,
        pageId: page.id,
        deletedBy: page.deletedBy ?? "",
        createdBy: page.createdBy ?? "",
        pageTitle: page.title ?? "Untitled",
      });
    });
  }

  console.log(
    `[warn-expiring-trash] Processed ${expiring.length} expiring pages.`
  );
}
