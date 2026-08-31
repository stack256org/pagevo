import type { PgBoss } from "pg-boss";
import { JOB_NAMES } from "@/lib/jobs/job-names";

// This is the ONLY file that calls boss.work() or boss.schedule().
// To add a new job: add the handler to lib/jobs/handlers/, then register it here.
export async function registerHandlers(boss: PgBoss) {
  const [
    { handleEmailSend },
    { handleEmailOutboxReap },
    { handleScaffoldHealthcheck },
    { handleAutoDeleteExpiredTrash },
    { handleWarnExpiringTrash },
    { handleExportPage },
    { handleCleanupStaleUploads },
    { handleCleanupOrphanedMedia },
    { handleSyncStorageUsage },
    { handleNotificationEmailSend },
    { handleNotificationDigestSend },
    { handleNotificationCleanup },
    { handleWorkspaceDelete },
    { handleExpireInvitations },
    { handleNotifyStorageThreshold },
    { handleWorkspaceInviteSend },
    { handleGuestInviteSend },
    { handleEntryReminderSend },
  ] = await Promise.all([
    import("@/lib/jobs/handlers/email-send"),
    import("@/lib/jobs/handlers/email-outbox-reap"),
    import("@/lib/jobs/handlers/scaffold-healthcheck"),
    import("@/lib/jobs/handlers/auto-delete-expired-trash"),
    import("@/lib/jobs/handlers/warn-expiring-trash"),
    import("@/lib/jobs/handlers/export-page"),
    import("@/lib/jobs/handlers/cleanup-stale-uploads"),
    import("@/lib/jobs/handlers/cleanup-orphaned-media"),
    import("@/lib/jobs/handlers/sync-storage-usage"),
    import("@/lib/jobs/handlers/notification-email-send"),
    import("@/lib/jobs/handlers/notification-digest-send"),
    import("@/lib/jobs/handlers/notification-cleanup"),
    import("@/lib/jobs/handlers/delete-workspace"),
    import("@/lib/jobs/handlers/expire-invitations"),
    import("@/lib/jobs/handlers/notify-storage-threshold"),
    import("@/lib/jobs/handlers/send-workspace-invite"),
    import("@/lib/jobs/handlers/send-guest-invite"),
    import("@/lib/jobs/handlers/entry-reminder-send"),
  ]);

  await Promise.all([
    boss.work(JOB_NAMES.EMAIL_SEND, { includeMetadata: true }, handleEmailSend),
    boss.work(
      JOB_NAMES.EMAIL_OUTBOX_REAP,
      { includeMetadata: true },
      handleEmailOutboxReap
    ),
    boss.work(
      JOB_NAMES.SCAFFOLD_HEALTHCHECK,
      { includeMetadata: true },
      handleScaffoldHealthcheck
    ),
    boss.work(
      JOB_NAMES.PAGE_AUTO_DELETE_EXPIRED_TRASH,
      { includeMetadata: true },
      handleAutoDeleteExpiredTrash
    ),
    boss.work(
      JOB_NAMES.PAGE_WARN_EXPIRING_TRASH,
      { includeMetadata: true },
      handleWarnExpiringTrash
    ),
    boss.work(
      JOB_NAMES.PAGE_EXPORT,
      { includeMetadata: true },
      handleExportPage
    ),
    boss.work(
      JOB_NAMES.STORAGE_CLEANUP_STALE_UPLOADS,
      { includeMetadata: true },
      handleCleanupStaleUploads
    ),
    boss.work(
      JOB_NAMES.STORAGE_CLEANUP_ORPHANED_MEDIA,
      { includeMetadata: true },
      handleCleanupOrphanedMedia
    ),
    boss.work(
      JOB_NAMES.STORAGE_SYNC_USAGE,
      { includeMetadata: true },
      handleSyncStorageUsage
    ),
    boss.work(
      JOB_NAMES.NOTIFICATION_EMAIL_SEND,
      { includeMetadata: true },
      handleNotificationEmailSend
    ),
    boss.work(
      JOB_NAMES.NOTIFICATION_DIGEST_SEND,
      { includeMetadata: true },
      handleNotificationDigestSend
    ),
    boss.work(
      JOB_NAMES.NOTIFICATION_CLEANUP,
      { includeMetadata: true },
      handleNotificationCleanup
    ),
    boss.work(
      JOB_NAMES.WORKSPACE_DELETE,
      { includeMetadata: true },
      handleWorkspaceDelete
    ),
    boss.work(
      JOB_NAMES.EXPIRE_INVITATIONS,
      { includeMetadata: true },
      handleExpireInvitations
    ),
    boss.work(
      JOB_NAMES.NOTIFY_STORAGE_THRESHOLD,
      { includeMetadata: true },
      handleNotifyStorageThreshold
    ),
    boss.work(
      JOB_NAMES.WORKSPACE_INVITE_SEND,
      { includeMetadata: true },
      handleWorkspaceInviteSend
    ),
    boss.work(
      JOB_NAMES.GUEST_INVITE_SEND,
      { includeMetadata: true },
      handleGuestInviteSend
    ),
    boss.work(
      JOB_NAMES.ENTRY_REMINDER_SEND,
      { includeMetadata: true },
      handleEntryReminderSend
    ),
  ]);

  // Scheduled cron jobs
  await boss.schedule(JOB_NAMES.EMAIL_OUTBOX_REAP, "*/15 * * * *", {});
  await boss.schedule(JOB_NAMES.SCAFFOLD_HEALTHCHECK, "*/10 * * * *", {});
  await boss.schedule(
    JOB_NAMES.PAGE_AUTO_DELETE_EXPIRED_TRASH,
    "0 2 * * *",
    {}
  ); // Daily 02:00 UTC
  await boss.schedule(JOB_NAMES.PAGE_WARN_EXPIRING_TRASH, "0 2 * * *", {}); // Daily 02:00 UTC
  await boss.schedule(
    JOB_NAMES.STORAGE_CLEANUP_STALE_UPLOADS,
    "*/30 * * * *",
    {}
  ); // Every 30 minutes
  await boss.schedule(
    JOB_NAMES.STORAGE_CLEANUP_ORPHANED_MEDIA,
    "0 4 * * *",
    {}
  ); // Daily 04:00 UTC
  await boss.schedule(JOB_NAMES.STORAGE_SYNC_USAGE, "0 4 * * *", {}); // Daily 04:00 UTC
  await boss.schedule(JOB_NAMES.NOTIFICATION_DIGEST_SEND, "0 * * * *", {}); // Hourly (filters by hour inside handler)
  await boss.schedule(JOB_NAMES.NOTIFICATION_CLEANUP, "0 5 * * *", {}); // Daily 05:00 UTC
  await boss.schedule(JOB_NAMES.EXPIRE_INVITATIONS, "0 1 * * *", {}); // Daily 01:00 UTC
  await boss.schedule(JOB_NAMES.NOTIFY_STORAGE_THRESHOLD, "0 6 * * *", {}); // Daily 06:00 UTC
  await boss.schedule(JOB_NAMES.ENTRY_REMINDER_SEND, "* * * * *", {}); // Every minute

  // Seed built-in templates immediately on startup if none exist
  autoSeedTemplatesOnStartup().catch((err) =>
    console.error("[startup] template seed failed:", err)
  );
}

async function autoSeedTemplatesOnStartup() {
  const { and, eq, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { templateCategories, templates } = await import("@/lib/db/schema");

  const existing = await db
    .select({ name: templates.name })
    .from(templates)
    .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)));
  const existingNames = new Set(existing.map((t) => t.name));

  const { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE_CATEGORIES } = await import(
    "@/lib/orbit/templates/built-in"
  );
  const missing = BUILT_IN_TEMPLATES.filter((t) => !existingNames.has(t.name));
  if (missing.length === 0) {
    return;
  }

  await db
    .insert(templateCategories)
    .values(DEFAULT_TEMPLATE_CATEGORIES)
    .onConflictDoNothing();

  const categories = await db
    .select({ id: templateCategories.id, key: templateCategories.key })
    .from(templateCategories);
  const categoryIdByKey = new Map(categories.map((c) => [c.key, c.id]));

  const rows = missing.flatMap((t) => {
    const categoryId = categoryIdByKey.get(t.category);
    if (!categoryId) {
      return [];
    }
    return [
      {
        name: t.name,
        description: t.description,
        categoryId,
        isBuiltIn: true,
        status: "published" as const,
        workspaceId: null,
        createdBy: null,
        pageSnapshot: t.pageSnapshot,
      },
    ];
  });
  if (rows.length === 0) {
    return;
  }

  await db.insert(templates).values(rows);
  console.log(`[startup] seeded ${rows.length} built-in templates`);
}
