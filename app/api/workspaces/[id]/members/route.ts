import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { triggerWorkspaceInviteNotification } from "@/lib/notifications/triggers";
import { writeAuditLog } from "@/lib/orbit/audit";
import {
  ApiError,
  apiError,
  getSession,
  getWorkspace,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";
import { getOrCreateInviteeUser } from "@/lib/workspaces/invites";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/members — list all members (active + invited)
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id);
    const workspace = await getWorkspace(id);

    const members = await db
      .select({
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        status: workspaceMembers.status,
        invitedEmail: workspaceMembers.invitedEmail,
        inviteExpires: workspaceMembers.inviteExpires,
        joinedAt: workspaceMembers.joinedAt,
        createdAt: workspaceMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
        userTimezone: users.timezone,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, id));

    // isOwner: the single workspace-creator concept (distinct from the
    // "admin" role, which can be held by more than one member) — surfaced
    // per-row so callers like the person hover card can label them
    // "Workspace Owner" without a second request just to look this up.
    const withOwner = members.map((m) => ({
      ...m,
      isOwner: !!m.userId && m.userId === workspace.createdBy,
    }));

    return Response.json(withOwner);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
});

// POST /api/workspaces/:id/members — invite a user by email
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    const _inviter = await requireWorkspaceMember(id, session.user.id, "admin");

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { role } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();
    const workspace = await getWorkspace(id);

    // Only the workspace owner can hand out the Admin role — any other
    // admin can still invite editors/viewers freely. Falls back to "any
    // admin" if the original owner's account no longer exists.
    const isOwner =
      workspace.createdBy === null || workspace.createdBy === session.user.id;
    if (role === "admin" && !isOwner) {
      return apiError(
        403,
        "Only the workspace owner can invite someone as an Admin"
      );
    }

    // Email must be lowercase to match better-auth's lookup. Pre-create a placeholder
    // user row if new, so the invite can attach a membership immediately.
    const { user: existingUser, isNew: isBrandNewInvitee } =
      await getOrCreateInviteeUser(email);

    if (!isBrandNewInvitee) {
      const [activeMember] = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.userId, existingUser.id),
            eq(workspaceMembers.status, "active")
          )
        )
        .limit(1);
      if (activeMember) {
        return apiError(409, "User is already a member of this workspace");
      }
    }

    // Check for existing pending invite to same email
    const [pendingInvite] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.invitedEmail, email),
          eq(workspaceMembers.status, "invited")
        )
      )
      .limit(1);
    if (pendingInvite) {
      return apiError(409, "An invite has already been sent to this email");
    }

    const inviteToken = crypto.randomUUID();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [member] = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: id,
          userId: existingUser.id,
          role,
          status: "invited",
          invitedEmail: email,
          inviteToken,
          inviteExpires,
          invitedBy: session.user.id,
        })
        .returning();

      // In-app notification only makes sense for someone who can already
      // sign in and check it — a brand-new invitee gets the email instead.
      if (!isBrandNewInvitee) {
        await triggerWorkspaceInviteNotification(tx, {
          workspaceId: id,
          inviterId: session.user.id,
          recipientId: existingUser.id,
          memberId: m.id,
        });
      }

      return [m];
    });

    console.log(
      `[invite] ${session.user.email} invited ${email} as "${role}" to workspace "${workspace.name}"${isBrandNewInvitee ? " (new account)" : " (existing account)"}`
    );

    // Same "click to accept" link for everyone, whether they already have an
    // account or not — /invite/[token] detects which case it is and either
    // asks them to sign in or lets them set a password right there.
    await enqueueJob(JOB_NAMES.WORKSPACE_INVITE_SEND, {
      memberId: member.id,
      workspaceId: id,
      invitedEmail: email,
      inviterName: session.user.name ?? session.user.email,
      workspaceName: workspace.name,
      inviteToken,
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "member.invited",
      targetType: "workspace",
      targetId: id,
      metadata: { invitedEmail: email, role, workspaceName: workspace.name },
    });

    return Response.json(member, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
