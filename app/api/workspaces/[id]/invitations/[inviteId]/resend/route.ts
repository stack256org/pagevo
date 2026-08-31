import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

// POST /api/workspaces/:id/invitations/:inviteId/resend — resend invite email + refresh token/expiry
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id, inviteId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const [invite] = await db
      .select({
        id: workspaceMembers.id,
        invitedEmail: workspaceMembers.invitedEmail,
        status: workspaceMembers.status,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.id, inviteId),
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.status, "invited")
        )
      )
      .limit(1);

    if (!invite) {
      return apiError(404, "Invitation not found");
    }

    const newToken = crypto.randomUUID();
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db
      .update(workspaceMembers)
      .set({ inviteToken: newToken, inviteExpires: newExpires })
      .where(eq(workspaceMembers.id, inviteId));

    const [ws] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    const [inviter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    await enqueueJob(JOB_NAMES.WORKSPACE_INVITE_SEND, {
      memberId: inviteId,
      workspaceId: id,
      invitedEmail: invite.invitedEmail ?? "",
      inviterName: inviter?.name ?? inviter?.email ?? "A teammate",
      workspaceName: ws?.name ?? "Pagevo",
      inviteToken: newToken,
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
