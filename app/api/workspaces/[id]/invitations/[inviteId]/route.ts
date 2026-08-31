import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

// DELETE /api/workspaces/:id/invitations/:inviteId — cancel a pending invitation
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id, inviteId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const [invite] = await db
      .select({ id: workspaceMembers.id, status: workspaceMembers.status })
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

    await db.delete(workspaceMembers).where(eq(workspaceMembers.id, inviteId));

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
