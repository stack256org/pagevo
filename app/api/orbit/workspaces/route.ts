import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";

export async function GET() {
  await requireAdmin();

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      icon: workspaces.icon,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));

  const memberCounts = await db
    .select({ workspaceId: workspaceMembers.workspaceId, count: count() })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.status, "active"))
    .groupBy(workspaceMembers.workspaceId);

  const countMap = new Map(memberCounts.map((r) => [r.workspaceId, r.count]));

  const result = rows.map((ws) => ({
    ...ws,
    memberCount: countMap.get(ws.id) ?? 0,
  }));

  return NextResponse.json(result);
}
