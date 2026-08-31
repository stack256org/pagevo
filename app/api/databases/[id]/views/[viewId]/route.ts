import { and, eq, ne } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseViews, pages, workspaceMembers } from "@/lib/db/schema";

async function guard(databaseId: string, userId: string) {
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, databaseId), eq(pages.kind, "database")))
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
  if (!member || member.role === "viewer") {
    return null;
  }
  return { page, member };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const { id, viewId } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const allowed = [
    "name",
    "type",
    "filters",
    "sorts",
    "groupByPropertyId",
    "calendarPropertyId",
    "ganttStartPropertyId",
    "ganttEndPropertyId",
    "cardDisplayProps",
    "hiddenPropertyIds",
    "boardSettings",
    "galleryCardSize",
    "entryOpenMode",
    "filterLogic",
    "propertyOverrides",
    "propertyOrder",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      patch[key] = body[key];
    }
  }

  const [view] = await db
    .update(databaseViews)
    .set(patch)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, id)))
    .returning();
  if (!view) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json(view);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  const { id, viewId } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Enforce: last view cannot be deleted
  const remaining = await db
    .select()
    .from(databaseViews)
    .where(and(eq(databaseViews.databaseId, id), ne(databaseViews.id, viewId)));
  if (!remaining.length) {
    return Response.json({ error: "last_view" }, { status: 400 });
  }

  await db
    .delete(databaseViews)
    .where(and(eq(databaseViews.id, viewId), eq(databaseViews.databaseId, id)));

  // If deleted view was the default, promote oldest remaining
  const [dbPage] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, id))
    .limit(1);
  if (dbPage.defaultViewId === viewId) {
    const oldest = remaining.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )[0];
    await db
      .update(pages)
      .set({ defaultViewId: oldest.id })
      .where(eq(pages.id, id));
  }

  return new Response(null, { status: 204 });
}
