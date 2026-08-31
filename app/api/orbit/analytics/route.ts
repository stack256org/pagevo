import { count, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";

export async function GET() {
  await requireAdmin();

  const now = new Date();
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [[totalUsers], [newUsers7d], [newUsers30d], [totalWorkspaces]] =
    await Promise.all([
      db.select({ count: count() }).from(users),
      db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, day7)),
      db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, day30)),
      db.select({ count: count() }).from(workspaces),
    ]);

  return NextResponse.json({
    totalUsers: totalUsers!.count,
    newUsers7d: newUsers7d!.count,
    newUsers30d: newUsers30d!.count,
    totalWorkspaces: totalWorkspaces!.count,
    // Placeholder metrics — real aggregation requires pages/blocks/feature tables
    activationRate: null,
    searchUsage: null,
    featureUsage: null,
  });
}
