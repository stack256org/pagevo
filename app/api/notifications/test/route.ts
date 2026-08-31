import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, pages, workspaceMembers } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

const VALID_TYPES = [
  "mention",
  "comment",
  "reply",
  "resolved",
  "reopened",
  "access_granted",
  "workspace_invite",
  "workspace_invite_accepted",
  "guest_accepted",
  "trash_warning",
  "page_update",
  "task_assigned",
] as const;

type NotifType = (typeof VALID_TYPES)[number];

const SNIPPETS: Record<NotifType, string> = {
  mention: "Hey @you, take a look at this section",
  comment: "This looks great, but we should revisit the design",
  reply: "Agreed! Let's schedule a call to discuss",
  resolved: "",
  reopened: "",
  access_granted: "",
  workspace_invite: "",
  workspace_invite_accepted: "Test User",
  guest_accepted: "Test User",
  trash_warning: "Q4 Planning Document",
  page_update: "Q4 Planning Document",
  task_assigned: "Design landing page",
};

// POST /api/notifications/test?workspaceId=xxx&type=mention
// Dev-only route — injects a sample notification for the current user so all
// types can be previewed in the UI without needing a second account.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError(404, "Not found");
  }

  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const type = searchParams.get("type") as NotifType | null;

    if (!workspaceId) {
      return apiError(400, "workspaceId required");
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return apiError(400, `type must be one of: ${VALID_TYPES.join(", ")}`);
    }

    // Verify user is a member of this workspace
    const [member] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);
    if (!member) {
      return apiError(403, "Not a workspace member");
    }

    // Pick any page in the workspace as the notification target
    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.workspaceId, workspaceId))
      .limit(1);

    const [inserted] = await db
      .insert(notifications)
      .values({
        workspaceId,
        recipientId: session.user.id,
        senderId: session.user.id,
        type,
        pageId: page?.id ?? null,
        sourceId: page?.id ?? null,
        contentSnippet: SNIPPETS[type] || null,
        isRead: false,
      })
      .returning({ id: notifications.id });

    return Response.json({ ok: true, notificationId: inserted.id, type });
  } catch (err) {
    console.error("[POST /api/notifications/test]", err);
    return apiError(500, "Internal error");
  }
}

// DELETE /api/notifications/test?workspaceId=xxx — clear all test notifications
export async function DELETE(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return apiError(404, "Not found");
  }

  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return apiError(400, "workspaceId required");
    }

    await db
      .delete(notifications)
      .where(eq(notifications.recipientId, session.user.id));

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/notifications/test]", err);
    return apiError(500, "Internal error");
  }
}
