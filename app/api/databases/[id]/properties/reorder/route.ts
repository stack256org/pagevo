import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseProperties, pages, workspaceMembers } from "@/lib/db/schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.kind, "database")))
    .limit(1);
  if (!page) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, page.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (!member || member.role === "viewer") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const { orderedIds } = (await req.json()) as { orderedIds: string[] };

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(databaseProperties)
        .set({ orderIndex: i })
        .where(eq(databaseProperties.id, orderedIds[i]));
    }
  });

  return Response.json({ success: true });
}
