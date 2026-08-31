import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { platformAuditLog, users } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const rows = await db
    .select({
      id: platformAuditLog.id,
      action: platformAuditLog.action,
      targetType: platformAuditLog.targetType,
      targetId: platformAuditLog.targetId,
      metadata: platformAuditLog.metadata,
      createdAt: platformAuditLog.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(platformAuditLog)
    .leftJoin(users, eq(platformAuditLog.actorId, users.id))
    .orderBy(desc(platformAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json(rows);
}
