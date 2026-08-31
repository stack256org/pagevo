import { and, asc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  databaseProperties,
  databaseViews,
  pages,
  workspaceMembers,
} from "@/lib/db/schema";

async function resolveDatabase(id: string, userId: string) {
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.kind, "database")))
    .limit(1);
  if (!page) {
    return null;
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, page.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  if (!member) {
    return null;
  }

  return { page, member };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  const ctx = await resolveDatabase(id, session.user.id);
  if (!ctx) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [views, properties] = await Promise.all([
    db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, id))
      .orderBy(asc(databaseViews.orderIndex)),
    db
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, id))
      .orderBy(asc(databaseProperties.orderIndex)),
  ]);

  return Response.json({ database: ctx.page, views, properties });
}
