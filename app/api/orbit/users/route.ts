import { count, desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions, users, workspaceMembers } from "@/lib/db/schema";

export async function GET() {
  await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      isPlatformAdmin: users.isPlatformAdmin,
      banned: users.banned,
      bannedReason: users.bannedReason,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  // attach workspace count per user
  const wsCounts = await db
    .select({ userId: workspaceMembers.userId, count: count() })
    .from(workspaceMembers)
    .groupBy(workspaceMembers.userId);

  const wsMap = new Map(wsCounts.map((r) => [r.userId, r.count]));

  const sessionCounts = await db
    .select({ userId: sessions.userId, count: count() })
    .from(sessions)
    .groupBy(sessions.userId);

  const sessionMap = new Map(sessionCounts.map((r) => [r.userId, r.count]));

  const result = rows.map((u) => ({
    ...u,
    workspaceCount: wsMap.get(u.id) ?? 0,
    sessionCount: sessionMap.get(u.id) ?? 0,
  }));

  return NextResponse.json(result);
}
