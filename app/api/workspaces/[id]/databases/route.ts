import { and, asc, eq, ilike } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseViews, pages } from "@/lib/db/schema";
import { createPageWithClosure } from "@/lib/pages/closure";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  const session = await requireSession();
  const member = await getWorkspaceMember(workspaceId, session.user.id);
  if (!member) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const conditions = [
    eq(pages.workspaceId, workspaceId),
    eq(pages.kind, "database"),
    eq(pages.isDeleted, false),
  ];
  if (q) {
    conditions.push(ilike(pages.title, `%${q}%`));
  }

  const rows = await db
    .select({ id: pages.id, title: pages.title, shortId: pages.shortId })
    .from(pages)
    .where(and(...conditions))
    .orderBy(asc(pages.title))
    .limit(20);

  return Response.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  const session = await requireSession();
  const member = await getWorkspaceMember(workspaceId, session.user.id);
  if (!member || member.role === "viewer") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { title?: string; parentId?: string };
  const title =
    (body.title ?? "Untitled Database").trim() || "Untitled Database";

  const database = await db.transaction(async (tx) => {
    const page = await createPageWithClosure(tx, {
      workspaceId,
      title,
      kind: "database",
      parentId: body.parentId ?? null,
      createdBy: session.user.id,
    });

    // Auto-create default Table view
    await tx.insert(databaseViews).values({
      databaseId: page.id,
      name: "Default View",
      type: "table",
      orderIndex: 0,
    });

    // Set defaultViewId — needs a second query since we need the view id
    const [view] = await tx
      .select({ id: databaseViews.id })
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, page.id))
      .limit(1);

    await tx
      .update(pages)
      .set({ defaultViewId: view.id })
      .where(eq(pages.id, page.id));

    return { ...page, defaultViewId: view.id };
  });

  return Response.json(database, { status: 201 });
}
