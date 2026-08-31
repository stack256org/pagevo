import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [user] = await db
    .select({ id: users.id, email: users.email, banned: users.banned })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) {
    return apiError(404, "User not found");
  }
  if (!user.banned) {
    return apiError(400, "User is not banned");
  }

  await db
    .update(users)
    .set({ banned: false, bannedReason: null, banExpires: null })
    .where(eq(users.id, id));

  await writeAuditLog({
    actorId: admin.user.id,
    action: "user.unbanned",
    targetType: "user",
    targetId: id,
    metadata: { email: user.email },
  });

  return NextResponse.json({ ok: true });
}
