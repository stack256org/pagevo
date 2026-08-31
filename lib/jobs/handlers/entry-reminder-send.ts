import { and, eq, lte } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { databaseProperties, entryReminders, pages } from "@/lib/db/schema";
import { triggerReminderNotification } from "@/lib/notifications/triggers";

// Runs every minute. Finds entry_reminders due (remindAt <= now, not yet
// notified), atomically marks each notified = true so a concurrent run can't
// double-send, then fires the in-app/email notification.
export async function handleEntryReminderSend(
  _jobs: Job<Record<string, never>>[]
) {
  const due = await db
    .select({
      id: entryReminders.id,
      entryId: entryReminders.entryId,
      propertyId: entryReminders.propertyId,
      workspaceId: entryReminders.workspaceId,
      recipientId: entryReminders.recipientId,
      entryTitle: pages.title,
      propertyName: databaseProperties.name,
    })
    .from(entryReminders)
    .innerJoin(pages, eq(pages.id, entryReminders.entryId))
    .innerJoin(
      databaseProperties,
      eq(databaseProperties.id, entryReminders.propertyId)
    )
    .where(
      and(
        eq(entryReminders.notified, false),
        lte(entryReminders.remindAt, new Date())
      )
    )
    .limit(200);

  if (due.length === 0) {
    return;
  }

  for (const reminder of due) {
    await db.transaction(async (tx) => {
      // Guarded UPDATE — prevents duplicate sends on concurrent runs
      const [updated] = await tx
        .update(entryReminders)
        .set({ notified: true })
        .where(
          and(
            eq(entryReminders.id, reminder.id),
            eq(entryReminders.notified, false)
          )
        )
        .returning({ id: entryReminders.id });

      if (!updated) {
        return; // Another concurrent run already handled this reminder
      }

      await triggerReminderNotification(tx, {
        workspaceId: reminder.workspaceId,
        pageId: reminder.entryId,
        recipientId: reminder.recipientId,
        entryTitle: reminder.entryTitle ?? "Untitled",
        propertyName: reminder.propertyName,
      });
    });
  }

  console.log(`[entry-reminder-send] Processed ${due.length} due reminders.`);
}
