import { and, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifications, workspaceMembers, workspaces } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { ApiError, apiError } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/transfer/confirm?token=xxx
// Validates token and atomically completes ownership transfer
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const token = new URL(req.url).searchParams.get("token");
    if (!token) {
      return apiError(400, "Missing token");
    }

    const identifier = `workspace-transfer:${id}:`;

    // Find the verification row — identifier prefix encodes workspaceId + targetUserId
    const allVerifications = await db
      .select()
      .from(verifications)
      .where(
        and(
          gt(verifications.expiresAt, new Date()),
          eq(verifications.value, token)
        )
      )
      .limit(1);

    const verification = allVerifications.find((v) =>
      v.identifier.startsWith(identifier)
    );

    if (!verification) {
      return apiError(410, "Transfer link has expired or is invalid");
    }

    const targetUserId = verification.identifier.split(":")[2];
    if (!targetUserId) {
      return apiError(400, "Malformed transfer token");
    }

    // Capture the outgoing owner before handing off
    const [workspace] = await db
      .select({ createdBy: workspaces.createdBy })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    const previousOwnerId = workspace?.createdBy ?? null;

    await db.transaction(async (tx) => {
      // Hand off the exclusive "owner" designation — this is what actually
      // controls who can grant/revoke the Admin role (see members routes),
      // not the role column itself, since multiple admins can now coexist.
      await tx
        .update(workspaces)
        .set({ createdBy: targetUserId })
        .where(eq(workspaces.id, id));

      // Make sure the new owner holds Admin (promote if they weren't
      // already one) — everyone else's role is left untouched.
      await tx
        .update(workspaceMembers)
        .set({ role: "admin" })
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.userId, targetUserId),
            eq(workspaceMembers.status, "active")
          )
        );

      // Consume the token
      await tx
        .delete(verifications)
        .where(eq(verifications.id, verification.id));
    });

    if (previousOwnerId) {
      await writeAuditLog({
        actorId: previousOwnerId,
        action: "workspace.ownership_transferred",
        targetType: "workspace",
        targetId: id,
        metadata: { fromUserId: previousOwnerId, toUserId: targetUserId },
      });
    }

    redirect("/platform/post-auth");
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
