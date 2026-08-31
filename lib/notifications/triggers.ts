import { and, eq, isNull, not } from "drizzle-orm";
import {
  extractMentionedUserIds,
  extractPlainText,
} from "@/lib/comments/mentions";
import type { Tx } from "@/lib/db";
import {
  comments,
  notifications,
  pages,
  workspaceMembers,
} from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";

// Mirrors the labels shown in the workspace members list/invite screens
// (components/settings/workspace-members-section.tsx) — "editor" reads as
// "Member" everywhere in the UI, so the notification should match.
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Member",
  viewer: "Viewer",
};

function snippet(content: Record<string, unknown>, max = 100): string {
  const text = extractPlainText(content);
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Notification types that the "What you'll receive" settings can individually
// opt out of. Types not in this map (comment, reply, resolved, reopened,
// access_granted, guest_accepted, trash_warning) always email when realtime.
// Narrowed to the four boolean notify_* columns (not plain `string`) so that
// indexing a preferences row by one of these yields boolean rather than the
// union of every column's type.
type CategoryPrefField =
  | "notifyMentions"
  | "notifyPageUpdates"
  | "notifyWorkspaceInvites"
  | "notifyTaskAssignments";

const CATEGORY_PREF_FIELD: Partial<
  Record<(typeof notifications.$inferInsert)["type"], CategoryPrefField>
> = {
  mention: "notifyMentions",
  page_update: "notifyPageUpdates",
  page_created: "notifyPageUpdates",
  workspace_invite: "notifyWorkspaceInvites",
  task_assigned: "notifyTaskAssignments",
};

async function getEmailPreference(
  tx: Tx,
  userId: string,
  type: (typeof notifications.$inferInsert)["type"]
): Promise<{ frequency: string; categoryEnabled: boolean }> {
  const { notificationPreferences } = await import("@/lib/db/schema");
  const [pref] = await tx
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  const field = CATEGORY_PREF_FIELD[type];
  const categoryEnabled = field ? (pref?.[field] ?? true) : true;
  return { frequency: pref?.emailFrequency ?? "daily", categoryEnabled };
}

async function insertAndEnqueue(
  tx: Tx,
  row: {
    workspaceId: string;
    recipientId: string;
    senderId: string | null;
    type: (typeof notifications.$inferInsert)["type"];
    pageId: string | null;
    sourceId: string | null;
    contentSnippet: string | null;
  }
) {
  const [inserted] = await tx
    .insert(notifications)
    .values(row)
    .returning({ id: notifications.id });

  const { frequency, categoryEnabled } = await getEmailPreference(
    tx,
    row.recipientId,
    row.type
  );
  if (frequency === "realtime" && categoryEnabled) {
    await enqueueJob(JOB_NAMES.NOTIFICATION_EMAIL_SEND, {
      notificationId: inserted.id,
      recipientId: row.recipientId,
    });
  }
}

async function getThreadParticipants(
  tx: Tx,
  rootCommentId: string,
  excludeUserId: string
): Promise<string[]> {
  const replies = await tx
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(
      and(eq(comments.parentId, rootCommentId), not(isNull(comments.authorId)))
    );

  const [root] = await tx
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.id, rootCommentId))
    .limit(1);

  const allIds = new Set<string>();
  if (root?.authorId) {
    allIds.add(root.authorId);
  }
  for (const r of replies) {
    if (r.authorId) {
      allIds.add(r.authorId);
    }
  }
  allIds.delete(excludeUserId);
  return [...allIds];
}

export async function triggerCommentNotifications(
  tx: Tx,
  params: {
    commentId: string;
    pageId: string;
    workspaceId: string;
    authorId: string;
    parentId: string | null;
    content: Record<string, unknown>;
  }
): Promise<void> {
  const { commentId, pageId, workspaceId, authorId, parentId, content } =
    params;
  const snip = snippet(content);

  if (parentId === null) {
    const [page] = await tx
      .select({ createdBy: pages.createdBy })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);

    if (page?.createdBy && page.createdBy !== authorId) {
      await insertAndEnqueue(tx, {
        workspaceId,
        recipientId: page.createdBy,
        senderId: authorId,
        type: "comment",
        pageId,
        sourceId: commentId,
        contentSnippet: snip,
      });
    }
  } else {
    const participants = await getThreadParticipants(tx, parentId, authorId);
    for (const recipientId of participants) {
      await insertAndEnqueue(tx, {
        workspaceId,
        recipientId,
        senderId: authorId,
        type: "reply",
        pageId,
        sourceId: commentId,
        contentSnippet: snip,
      });
    }
  }
}

export async function triggerMentionNotifications(
  tx: Tx,
  params: {
    commentId: string;
    pageId: string;
    workspaceId: string;
    authorId: string;
    content: Record<string, unknown>;
    skipUserIds?: string[];
  }
): Promise<void> {
  const {
    commentId,
    pageId,
    workspaceId,
    authorId,
    content,
    skipUserIds = [],
  } = params;

  const mentioned = extractMentionedUserIds(content);
  const toNotify = mentioned.filter(
    (id) => id !== authorId && !skipUserIds.includes(id)
  );
  if (!toNotify.length) {
    return;
  }

  const snip = snippet(content);
  for (const recipientId of toNotify) {
    await insertAndEnqueue(tx, {
      workspaceId,
      recipientId,
      senderId: authorId,
      type: "mention",
      pageId,
      sourceId: commentId,
      contentSnippet: snip,
    });
  }
}

export async function triggerResolvedNotification(
  tx: Tx,
  params: {
    commentId: string;
    pageId: string;
    workspaceId: string;
    resolverId: string;
  }
): Promise<void> {
  const { commentId, pageId, workspaceId, resolverId } = params;
  const participants = await getThreadParticipants(tx, commentId, resolverId);
  for (const recipientId of participants) {
    await insertAndEnqueue(tx, {
      workspaceId,
      recipientId,
      senderId: resolverId,
      type: "resolved",
      pageId,
      sourceId: commentId,
      contentSnippet: null,
    });
  }
}

export async function triggerReopenedNotification(
  tx: Tx,
  params: {
    commentId: string;
    pageId: string;
    workspaceId: string;
    reopenerId: string;
  }
): Promise<void> {
  const { commentId, pageId, workspaceId, reopenerId } = params;
  const participants = await getThreadParticipants(tx, commentId, reopenerId);
  for (const recipientId of participants) {
    await insertAndEnqueue(tx, {
      workspaceId,
      recipientId,
      senderId: reopenerId,
      type: "reopened",
      pageId,
      sourceId: commentId,
      contentSnippet: null,
    });
  }
}

export async function triggerAccessGrantedNotification(
  tx: Tx,
  params: {
    pageId: string;
    workspaceId: string;
    granterId: string;
    recipientId: string;
    permissionId: string;
  }
): Promise<void> {
  const { pageId, workspaceId, granterId, recipientId, permissionId } = params;
  if (granterId === recipientId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId,
    senderId: granterId,
    type: "access_granted",
    pageId,
    sourceId: permissionId,
    contentSnippet: null,
  });
}

export async function triggerWorkspaceInviteNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    inviterId: string;
    recipientId: string;
    memberId: string;
  }
): Promise<void> {
  const { workspaceId, inviterId, recipientId, memberId } = params;
  if (inviterId === recipientId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId,
    senderId: inviterId,
    type: "workspace_invite",
    pageId: null,
    sourceId: memberId,
    contentSnippet: null,
  });
}

export async function triggerWorkspaceInviteAcceptedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    inviterId: string;
    accepterId: string;
    memberId: string;
    accepterName: string;
  }
): Promise<void> {
  const { workspaceId, inviterId, accepterId, memberId, accepterName } = params;
  if (inviterId === accepterId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: inviterId,
    senderId: accepterId,
    type: "workspace_invite_accepted",
    pageId: null,
    sourceId: memberId,
    contentSnippet: accepterName.slice(0, 100),
  });
}

export async function triggerGuestAcceptedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    inviterId: string;
    acceptorId: string;
    pageId: string;
    invitationId: string;
    acceptorName: string;
  }
): Promise<void> {
  const {
    workspaceId,
    inviterId,
    acceptorId,
    pageId,
    invitationId,
    acceptorName,
  } = params;
  if (inviterId === acceptorId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: inviterId,
    senderId: acceptorId,
    type: "guest_accepted",
    pageId,
    sourceId: invitationId,
    contentSnippet: acceptorName.slice(0, 100),
  });
}

export async function triggerPageUpdateNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    editorId: string;
    createdBy: string;
    pageTitle: string;
  }
): Promise<void> {
  const { workspaceId, pageId, editorId, createdBy, pageTitle } = params;
  if (editorId === createdBy) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: createdBy,
    senderId: editorId,
    type: "page_update",
    pageId,
    sourceId: pageId,
    contentSnippet: pageTitle.slice(0, 100),
  });
}

// Excludes the creator (Hard Rule 11) and skips private pages (unopenable link)
// and entries (too frequent, would become noise).
export async function triggerPageCreatedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    creatorId: string;
    pageTitle: string;
    isPrivate: boolean;
    kind: string;
    isDraft: boolean;
  }
): Promise<void> {
  const { workspaceId, pageId, creatorId, isPrivate, kind, isDraft } = params;
  if (isPrivate || kind === "entry" || isDraft) {
    return;
  }

  const members = await tx
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
        not(isNull(workspaceMembers.userId))
      )
    );

  for (const { userId } of members) {
    if (!userId || userId === creatorId) {
      continue;
    }
    // contentSnippet stays null — the page title is already shown via the
    // pageId join (same reasoning as trash_warning above), so repeating it
    // here just duplicated the same text in the notification card's UI.
    await insertAndEnqueue(tx, {
      workspaceId,
      recipientId: userId,
      senderId: creatorId,
      type: "page_created",
      pageId,
      sourceId: pageId,
      contentSnippet: null,
    });
  }
}

export async function triggerTaskAssignedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    assignerId: string;
    assigneeId: string;
    entryTitle: string;
  }
): Promise<void> {
  const { workspaceId, pageId, assignerId, assigneeId, entryTitle } = params;
  if (assignerId === assigneeId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: assigneeId,
    senderId: assignerId,
    type: "task_assigned",
    pageId,
    sourceId: pageId,
    contentSnippet: entryTitle.slice(0, 100),
  });
}

// Notifies the creator their page moved to Trash; skipped when they're also the
// deleter (Hard Rule 11), same shape as triggerPageUpdateNotification's guard.
export async function triggerPageDeletedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    deletedBy: string;
    createdBy: string;
    pageTitle: string;
  }
): Promise<void> {
  const { workspaceId, pageId, deletedBy, createdBy } = params;
  if (createdBy === deletedBy) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: createdBy,
    senderId: deletedBy,
    type: "trash_warning",
    pageId,
    sourceId: pageId,
    contentSnippet: null,
  });
}

// Cron-only forward-looking alert, not tied to a live actor (deletedBy is
// historical), so deleter and creator are both warned, even if the same person.
export async function triggerTrashWarningNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    deletedBy: string;
    createdBy: string;
    pageTitle: string;
  }
): Promise<void> {
  const { workspaceId, pageId, deletedBy, createdBy } = params;

  // contentSnippet stays null — the page title is already shown via the
  // pageId join, so repeating it here just duplicated the same text in
  // the UI.
  const recipients = new Set<string>([deletedBy, createdBy]);
  for (const recipientId of recipients) {
    await insertAndEnqueue(tx, {
      workspaceId,
      recipientId,
      senderId: deletedBy,
      type: "trash_warning",
      pageId,
      sourceId: pageId,
      contentSnippet: null,
    });
  }
}

export async function triggerRoleChangedNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    changerId: string;
    memberId: string;
    previousRole: string;
    newRole: string;
  }
): Promise<void> {
  const { workspaceId, changerId, memberId, previousRole, newRole } = params;
  if (changerId === memberId) {
    return;
  }
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId: memberId,
    senderId: changerId,
    type: "role_changed",
    pageId: null,
    sourceId: null,
    contentSnippet: `${ROLE_LABEL[previousRole] ?? previousRole} → ${ROLE_LABEL[newRole] ?? newRole}`,
  });
}

export async function triggerReminderNotification(
  tx: Tx,
  params: {
    workspaceId: string;
    pageId: string;
    recipientId: string;
    entryTitle: string;
    propertyName: string;
  }
): Promise<void> {
  const { workspaceId, pageId, recipientId, entryTitle, propertyName } = params;
  await insertAndEnqueue(tx, {
    workspaceId,
    recipientId,
    senderId: null,
    type: "reminder",
    pageId,
    sourceId: pageId,
    contentSnippet: `${propertyName}: ${entryTitle}`.slice(0, 100),
  });
}
