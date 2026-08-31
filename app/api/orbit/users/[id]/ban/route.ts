import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function POST(
  req: NextRequest,
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
  if (user.banned) {
    return apiError(400, "User is already banned");
  }
  if (id === admin.user.id) {
    return apiError(400, "Cannot ban yourself");
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : undefined;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ banned: true, bannedReason: reason ?? null })
      .where(eq(users.id, id));

    // revoke all sessions immediately
    await tx.delete(sessions).where(eq(sessions.userId, id));
  });

  await writeAuditLog({
    actorId: admin.user.id,
    action: "user.banned",
    targetType: "user",
    targetId: id,
    metadata: { email: user.email, reason: reason ?? null },
  });

  return NextResponse.json({ ok: true });
}
