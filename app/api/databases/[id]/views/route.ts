import { and, asc, count, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseViews, pages, workspaceMembers } from "@/lib/db/schema";

async function guard(
  databaseId: string,
  userId: string,
  requireEditor = false
) {
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
  if (!member) {
    return null;
  }
  if (requireEditor && member.role === "viewer") {
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
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, id))
    .orderBy(asc(databaseViews.orderIndex));
  return Response.json(views);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id, true))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name: string;
    type: "table" | "board" | "calendar" | "gallery" | "gantt";
    filters?: unknown;
    sorts?: unknown;
    filterLogic?: "and" | "or";
    groupByPropertyId?: string | null;
    calendarPropertyId?: string | null;
    ganttStartPropertyId?: string | null;
    ganttEndPropertyId?: string | null;
    cardDisplayProps?: unknown;
    galleryCardSize?: "small" | "medium" | "large" | null;
    entryOpenMode?: "side_panel" | "full_page";
  };

  const [{ maxIdx }] = await db
    .select({ maxIdx: count(databaseViews.id) })
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, id));

  const [view] = await db
    .insert(databaseViews)
    .values({
      databaseId: id,
      name: body.name ?? "New View",
      type: body.type ?? "table",
      orderIndex: Number(maxIdx),
      filters:
        (body.filters as (typeof databaseViews.$inferInsert)["filters"]) ?? [],
      sorts: (body.sorts as (typeof databaseViews.$inferInsert)["sorts"]) ?? [],
      filterLogic: body.filterLogic ?? "and",
      groupByPropertyId: body.groupByPropertyId ?? null,
      calendarPropertyId: body.calendarPropertyId ?? null,
      ganttStartPropertyId: body.ganttStartPropertyId ?? null,
      ganttEndPropertyId: body.ganttEndPropertyId ?? null,
      cardDisplayProps:
        (body.cardDisplayProps as (typeof databaseViews.$inferInsert)["cardDisplayProps"]) ??
        [],
      galleryCardSize: body.galleryCardSize ?? null,
      entryOpenMode: body.entryOpenMode ?? "side_panel",
    })
    .returning();

  return Response.json(view, { status: 201 });
}
