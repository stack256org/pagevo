export const JOB_NAMES = {
  EMAIL_OUTBOX_REAP: "email.outbox-reap",
  EMAIL_SEND: "email.send",
  SCAFFOLD_HEALTHCHECK: "scaffold.healthcheck",
  WORKSPACE_INVITE_SEND: "workspace.invite-send",
  PAGE_AUTO_DELETE_EXPIRED_TRASH: "page.auto-delete-expired-trash",
  PAGE_WARN_EXPIRING_TRASH: "page.warn-expiring-trash",
  PAGE_EXPORT: "page.export",
  STORAGE_CLEANUP_STALE_UPLOADS: "storage.cleanup-stale-uploads",
  STORAGE_CLEANUP_ORPHANED_MEDIA: "storage.cleanup-orphaned-media",
  STORAGE_SYNC_USAGE: "storage.sync-usage",
  NOTIFICATION_EMAIL_SEND: "notification.email-send",
  NOTIFICATION_DIGEST_SEND: "notification.digest-send",
  NOTIFICATION_CLEANUP: "notification.cleanup",
  WORKSPACE_DELETE: "workspace.delete",
  EXPIRE_INVITATIONS: "workspace.expire-invitations",
  NOTIFY_STORAGE_THRESHOLD: "storage.notify-threshold",
  GUEST_INVITE_SEND: "guest.invite-send",
  ENTRY_REMINDER_SEND: "entry.reminder-send",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface EmailSendPayload {
  outboxId: string;
}

export interface WorkspaceInviteSendPayload {
  invitedEmail: string;
  inviterName: string;
  inviteToken: string;
  memberId: string;
  workspaceId: string;
  workspaceName: string;
}

export interface PageExportPayload {
  format: "markdown" | "html";
  pageId: string;
  userId: string;
}

export interface NotificationEmailSendPayload {
  notificationId: string;
  recipientId: string;
}

export interface WorkspaceDeletePayload {
  workspaceId: string;
}

export interface GuestInviteSendPayload {
  accessLevel: string;
  email: string;
  invitationId: string;
  inviterName: string;
  inviteToken: string;
  pageTitle: string;
}

export type JobPayloads = {
  [JOB_NAMES.EMAIL_OUTBOX_REAP]: Record<string, never>;
  [JOB_NAMES.EMAIL_SEND]: EmailSendPayload;
  [JOB_NAMES.SCAFFOLD_HEALTHCHECK]: Record<string, never>;
  [JOB_NAMES.WORKSPACE_INVITE_SEND]: WorkspaceInviteSendPayload;
  [JOB_NAMES.PAGE_AUTO_DELETE_EXPIRED_TRASH]: Record<string, never>;
  [JOB_NAMES.PAGE_WARN_EXPIRING_TRASH]: Record<string, never>;
  [JOB_NAMES.PAGE_EXPORT]: PageExportPayload;
  [JOB_NAMES.STORAGE_CLEANUP_STALE_UPLOADS]: Record<string, never>;
  [JOB_NAMES.STORAGE_CLEANUP_ORPHANED_MEDIA]: Record<string, never>;
  [JOB_NAMES.STORAGE_SYNC_USAGE]: Record<string, never>;
  [JOB_NAMES.NOTIFICATION_EMAIL_SEND]: NotificationEmailSendPayload;
  [JOB_NAMES.NOTIFICATION_DIGEST_SEND]: Record<string, never>;
  [JOB_NAMES.NOTIFICATION_CLEANUP]: Record<string, never>;
  [JOB_NAMES.WORKSPACE_DELETE]: WorkspaceDeletePayload;
  [JOB_NAMES.EXPIRE_INVITATIONS]: Record<string, never>;
  [JOB_NAMES.NOTIFY_STORAGE_THRESHOLD]: Record<string, never>;
  [JOB_NAMES.GUEST_INVITE_SEND]: GuestInviteSendPayload;
  [JOB_NAMES.ENTRY_REMINDER_SEND]: Record<string, never>;
};
