import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Job } from "pg-boss";
import { createElement } from "react";
import { PRODUCT_NAME } from "@/config/platform";
import { db } from "@/lib/db";
import {
  notificationPreferences,
  notifications,
  pages,
  users,
} from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email";
import { DigestEmail } from "@/lib/email/components/digest";
import { renderEmailTemplate } from "@/lib/email/renderer";
import { env } from "@/lib/env";

export async function handleNotificationDigestSend(
  jobs: Job<Record<string, never>>[]
) {
  for (const _job of jobs) {
    await processDigests();
  }
}

async function processDigests() {
  const nowHour = new Date().getUTCHours();

  // Find users who want a daily or weekly digest at this UTC hour (approximation).
  // A full TZ-aware implementation would store user timezone and convert — this sends
  // to all daily/weekly users at 8:00 UTC as a simple first pass.
  if (nowHour !== 8) {
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Users with daily or weekly preference
  const dayOfWeek = new Date().getUTCDay();

  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(
      inArray(notificationPreferences.emailFrequency, ["daily", "weekly"])
    );

  for (const pref of prefs) {
    if (
      pref.emailFrequency === "weekly" &&
      pref.weeklyDigestDay !== dayOfWeek
    ) {
      continue;
    }

    await sendDigestForUser(pref, today);
  }
}

// Notification types the "What you'll receive" settings can opt out of;
// everything else always appears in the digest.
const CATEGORY_PREF_FIELD: Partial<
  Record<string, keyof typeof notificationPreferences.$inferSelect>
> = {
  mention: "notifyMentions",
  page_update: "notifyPageUpdates",
  page_created: "notifyPageUpdates",
  workspace_invite: "notifyWorkspaceInvites",
  task_assigned: "notifyTaskAssignments",
};

async function sendDigestForUser(
  pref: typeof notificationPreferences.$inferSelect,
  since: Date
) {
  const userId = pref.userId;
  const unreadAll = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      contentSnippet: notifications.contentSnippet,
      pageId: notifications.pageId,
      senderId: notifications.senderId,
      createdAt: notifications.createdAt,
      senderName: users.name,
      pageTitle: pages.title,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.senderId))
    .leftJoin(pages, eq(pages.id, notifications.pageId))
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.isRead, false),
        gte(notifications.createdAt, since)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const unread = unreadAll.filter((n) => {
    const field = CATEGORY_PREF_FIELD[n.type];
    return field ? pref[field] !== false : true;
  });

  if (!unread.length) {
    return; // No unread (or all opted-out) — skip digest
  }

  const [recipient] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!recipient) {
    return;
  }

  // Group by page
  const byPage = new Map<string, typeof unread>();
  for (const n of unread) {
    const key = n.pageTitle ?? "(no page)";
    if (!byPage.has(key)) {
      byPage.set(key, []);
    }
    byPage.get(key)!.push(n);
  }

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const subject = `Your ${PRODUCT_NAME} activity for ${dateLabel}`;
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  const sections = [...byPage.entries()].map(([pageTitle, items]) => ({
    pageTitle,
    items: items.map((n) => ({
      who: n.senderName ?? "System",
      snippet: n.contentSnippet,
    })),
  }));

  const html = await renderEmailTemplate(
    createElement(DigestEmail, {
      dateLabel,
      sections,
      actionUrl: appUrl,
      settingsUrl: `${appUrl}/settings/notifications`,
    })
  );

  await enqueueEmail({
    to: recipient.email,
    subject,
    html,
    type: "digest_email",
  });
}
