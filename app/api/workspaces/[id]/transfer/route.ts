import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, verifications, workspaceMembers } from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email";
import { env } from "@/lib/env";
import {
  ApiError,
  apiError,
  getSession,
  getWorkspace,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

const transferSchema = z.object({
  targetUserId: z.string().uuid(),
});

// POST /api/workspaces/:id/transfer — initiate ownership transfer
// Sends a confirmation email to the current Admin
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const body = await req.json();
    const parsed = transferSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { targetUserId } = parsed.data;
    const workspace = await getWorkspace(id);

    // Only the current owner can hand off ownership — the confirmation
    // email goes to whoever initiates this, so allowing any admin to start
    // a transfer would let them redirect ownership to themselves or a third
    // party without the actual owner's consent.
    if (
      workspace.createdBy !== null &&
      workspace.createdBy !== session.user.id
    ) {
      return apiError(403, "Only the workspace owner can transfer ownership");
    }

    if (targetUserId === workspace.createdBy) {
      return apiError(400, "Target user is already the workspace owner");
    }

    // Target must already be an active member of this workspace
    const [targetMember] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, targetUserId),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);

    if (!targetMember) {
      return apiError(
        404,
        "Target user is not an active member of this workspace"
      );
    }

    const [targetUser] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return apiError(404, "Target user not found");
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // `identifier` has no unique constraint (shared table, better-auth allows multiple
    // rows per identifier), so delete-then-insert instead of upsert.
    const identifier = `workspace-transfer:${id}:${targetUserId}`;
    await db.transaction(async (tx) => {
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, identifier));
      await tx
        .insert(verifications)
        .values({ identifier, value: token, expiresAt });
    });

    const confirmUrl = `${env.NEXT_PUBLIC_APP_URL}/api/workspaces/${id}/transfer/confirm?token=${token}`;

    await enqueueEmail({
      to: session.user.email,
      subject: `Confirm transfer of ${workspace.name}`,
      html: `<p>You requested to transfer ownership of <strong>${workspace.name}</strong> to ${targetUser.name ?? targetUser.email}.</p><p><a href="${confirmUrl}">Confirm transfer</a></p><p>This link expires in 24 hours.</p>`,
      text: `You requested to transfer ownership of ${workspace.name} to ${targetUser.name ?? targetUser.email}.\n\nConfirm transfer:\n${confirmUrl}\n\nThis link expires in 24 hours.`,
    });

    return Response.json({ message: "Confirmation email sent" });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
