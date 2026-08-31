import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { apiError } from "@/lib/workspaces/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) {
    return apiError(404, "User not found");
  }

  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, id))
    .orderBy(sessions.createdAt);

  const memberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      joinedAt: workspaceMembers.joinedAt,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspaceIcon: workspaces.icon,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, id));

  return NextResponse.json({ user, sessions: userSessions, memberships });
}
