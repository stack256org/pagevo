import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) {
    return apiError(404, "User not found");
  }

  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, id))
    .returning({ id: sessions.id });

  await writeAuditLog({
    actorId: admin.user.id,
    action: "session.revoked_all",
    targetType: "user",
    targetId: id,
    metadata: { email: user.email, count: deleted.length },
  });

  return NextResponse.json({ ok: true, count: deleted.length });
}
