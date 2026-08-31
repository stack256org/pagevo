import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userPreferences, workspaceMembers, workspaces } from "@/lib/db/schema";
import { triggerRoleChangedNotification } from "@/lib/notifications/triggers";
import { writeAuditLog } from "@/lib/orbit/audit";
import {
  ApiError,
  apiError,
  countActiveAdmins,
  getSession,
  getWorkspace,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string; userId: string }> };

const patchSchema = z.object({
  role: z.enum(["admin", "editor", "viewer"]),
});

// PATCH /api/workspaces/:id/members/:userId — change role
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const [target] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!target) {
      return apiError(404, "Member not found");
    }

    const workspace = await getWorkspace(id);
    // The owner's own membership row is untouchable here — swapping who
    // holds that seat is a bigger deal (see Transfer Ownership) than a
    // regular role edit, and protecting it guarantees the workspace always
    // has at least one admin without needing a separate count check for it.
    if (workspace.createdBy === userId) {
      return apiError(
        403,
        "The workspace owner's role can only be changed via Transfer Ownership"
      );
    }

    const isOwner =
      workspace.createdBy === null || workspace.createdBy === session.user.id;
    const settingAdmin = parsed.data.role === "admin";
    const wasAdmin = target.role === "admin";

    if ((settingAdmin || wasAdmin) && !isOwner) {
      return apiError(
        403,
        "Only the workspace owner can grant or revoke the Admin role"
      );
    }

    if (wasAdmin && !settingAdmin) {
      const adminCount = await countActiveAdmins(id);
      if (adminCount <= 1) {
        return apiError(400, "Cannot demote the workspace's last admin");
      }
    }

    // Nothing actually changes — skip the write, audit log entry, and
    // notification rather than recording a no-op role "change".
    if (target.role === parsed.data.role) {
      return Response.json(target);
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(workspaceMembers)
        .set({ role: parsed.data.role })
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.userId, userId)
          )
        )
        .returning();

      await triggerRoleChangedNotification(tx, {
        workspaceId: id,
        changerId: session.user.id,
        memberId: userId,
        previousRole: target.role,
        newRole: parsed.data.role,
      });

      return row;
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "member.role_changed",
      targetType: "workspace",
      targetId: id,
      metadata: {
        targetUserId: userId,
        previousRole: target.role,
        newRole: parsed.data.role,
      },
    });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/workspaces/:id/members/:userId — remove a member
// Business rule: regenerate invite_link_token in same transaction as the delete
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id, userId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const [target] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!target) {
      return apiError(404, "Member not found");
    }

    const workspace = await getWorkspace(id);
    if (workspace.createdBy === userId) {
      return apiError(
        403,
        "Cannot remove the workspace owner — transfer ownership first"
      );
    }

    if (target.role === "admin") {
      const isOwner =
        workspace.createdBy === null || workspace.createdBy === session.user.id;
      if (!isOwner) {
        return apiError(
          403,
          "Only the workspace owner can remove another admin"
        );
      }
      const adminCount = await countActiveAdmins(id);
      if (adminCount <= 1) {
        return apiError(400, "Cannot remove the workspace's last admin");
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.userId, userId)
          )
        );

      // Regenerate invite link token so removed user cannot silently rejoin
      await tx
        .update(workspaces)
        .set({ inviteLinkToken: crypto.randomUUID(), updatedAt: new Date() })
        .where(eq(workspaces.id, id));

      // Clear the removed user's "last active workspace" pointer if it
      // pointed here, so their next post-auth redirect doesn't try to send
      // them back into a workspace they no longer belong to.
      await tx
        .update(userPreferences)
        .set({ lastWorkspaceId: null })
        .where(
          and(
            eq(userPreferences.userId, userId),
            eq(userPreferences.lastWorkspaceId, id)
          )
        );
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "member.removed",
      targetType: "workspace",
      targetId: id,
      metadata: { targetUserId: userId, previousRole: target.role },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
