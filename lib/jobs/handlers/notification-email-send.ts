import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import { createElement } from "react";
import { db } from "@/lib/db";
import {
  notificationPreferences,
  notifications,
  pages,
  users,
} from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email";
import { NotificationEmail } from "@/lib/email/components/notification";
import { renderEmailTemplate } from "@/lib/email/renderer";
import { env } from "@/lib/env";
import type { NotificationEmailSendPayload } from "@/lib/jobs/job-names";

const TYPE_LABELS: Record<string, string> = {
  mention: "mentioned you in a comment",
  comment: "commented on your page",
  reply: "replied to your comment",
  resolved: "resolved a comment thread",
  reopened: "reopened a comment thread",
  access_granted: "granted you access to a page",
  workspace_invite: "added you to a workspace",
  workspace_invite_accepted: "accepted your workspace invite",
  guest_accepted: "accepted your guest invitation",
  trash_warning: "A page you own will be permanently deleted in 3 days",
};

export async function handleNotificationEmailSend(
  jobs: Job<NotificationEmailSendPayload>[]
) {
  for (const job of jobs) {
    const { notificationId, recipientId } = job.data;

    const [notif] = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        contentSnippet: notifications.contentSnippet,
        pageId: notifications.pageId,
        senderId: notifications.senderId,
        workspaceId: notifications.workspaceId,
        senderName: users.name,
        pageTitle: pages.title,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.senderId))
      .leftJoin(pages, eq(pages.id, notifications.pageId))
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!notif) {
      continue;
    }

    // Check preference is still realtime
    const [pref] = await db
      .select({ emailFrequency: notificationPreferences.emailFrequency })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, recipientId))
      .limit(1);

    if (pref && pref.emailFrequency !== "realtime") {
      continue;
    }

    const [recipient] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, recipientId))
      .limit(1);

    if (!recipient) {
      continue;
    }

    const senderLabel = notif.senderName ?? "Someone";
    const action = TYPE_LABELS[notif.type] ?? "sent you a notification";
    const pageLabel = notif.pageTitle ? ` on "${notif.pageTitle}"` : "";
    const appUrl = env.NEXT_PUBLIC_APP_URL;

    const subject = `${senderLabel} ${action}${pageLabel}`;
    const html = await renderEmailTemplate(
      createElement(NotificationEmail, {
        subject,
        snippet: notif.contentSnippet,
        actionUrl: appUrl,
        footerNote:
          "You're receiving this because you have real-time email notifications enabled.",
      })
    );

    await enqueueEmail({
      to: recipient.email,
      subject,
      html,
      type: "notification_email",
    });
  }
}
