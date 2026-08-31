import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";
import {
  acceptWorkspaceInviteTx,
  joinWorkspaceViaLinkTx,
} from "@/lib/workspaces/invites";

type Ctx = { params: Promise<{ token: string }> };

// POST /api/invite/:token/accept
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const session = await getSession();

    const [member] = await db
      .select({
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        status: workspaceMembers.status,
        invitedEmail: workspaceMembers.invitedEmail,
        inviteExpires: workspaceMembers.inviteExpires,
        invitedBy: workspaceMembers.invitedBy,
        workspaceSlug: workspaces.slug,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.inviteToken, token))
      .limit(1);

    if (!member) {
      return acceptViaShareLink(token, session);
    }
    if (member.status !== "invited") {
      return apiError(409, "Invite already used or expired");
    }
    if (member.inviteExpires && member.inviteExpires < new Date()) {
      await db
        .update(workspaceMembers)
        .set({ status: "expired" })
        .where(eq(workspaceMembers.id, member.id));
      return apiError(410, "Invite has expired");
    }
    if (member.invitedEmail && member.invitedEmail !== session.user.email) {
      return apiError(403, "This invite was sent to a different email address");
    }

    // Check not already active member
    const [alreadyMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, member.workspaceId),
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (alreadyMember) {
      return Response.json({ workspaceSlug: member.workspaceSlug });
    }

    await db.transaction(async (tx) => {
      await acceptWorkspaceInviteTx(tx, {
        memberId: member.id,
        workspaceId: member.workspaceId,
        userId: session.user.id,
        invitedBy: member.invitedBy,
        accepterName: session.user.name ?? session.user.email,
      });
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "member.joined",
      targetType: "workspace",
      targetId: member.workspaceId,
      metadata: {
        email: session.user.email,
        invitedEmail: member.invitedEmail,
      },
    });

    return Response.json({ workspaceSlug: member.workspaceSlug });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// Falls back to the workspace's shareable "invite link" (workspaces.inviteLinkToken)
// when the token doesn't match any per-email invite — see joinWorkspaceViaLinkTx.
async function acceptViaShareLink(
  token: string,
  session: Awaited<ReturnType<typeof getSession>>
) {
  const [ws] = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      inviteLinkActive: workspaces.inviteLinkActive,
      inviteLinkRole: workspaces.inviteLinkRole,
    })
    .from(workspaces)
    .where(eq(workspaces.inviteLinkToken, token))
    .limit(1);

  if (!ws?.inviteLinkActive) {
    return apiError(404, "Invite not found");
  }

  const [alreadyMember] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, ws.id),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  if (alreadyMember) {
    return Response.json({ workspaceSlug: ws.slug });
  }

  await db.transaction(async (tx) => {
    await joinWorkspaceViaLinkTx(tx, {
      workspaceId: ws.id,
      userId: session.user.id,
      role: ws.inviteLinkRole,
    });
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: "member.joined",
    targetType: "workspace",
    targetId: ws.id,
    metadata: { email: session.user.email, via: "invite_link" },
  });

  return Response.json({ workspaceSlug: ws.slug });
}
