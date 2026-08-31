import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) {
    return apiError(404, "Workspace not found");
  }

  const members = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      joinedAt: workspaceMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, id));

  return NextResponse.json({ workspace: ws, members });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) {
    return apiError(404, "Workspace not found");
  }

  await db.delete(workspaces).where(eq(workspaces.id, id));

  await writeAuditLog({
    actorId: admin.user.id,
    action: "workspace.force_deleted",
    targetType: "workspace",
    targetId: id,
    metadata: { name: ws.name },
  });

  return NextResponse.json({ ok: true });
}
