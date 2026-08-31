import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { blocks, pages, workspaces } from "@/lib/db/schema";
import { insertPageWithClosure } from "@/lib/pages/closure";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ parent?: string }>;
};

export default async function NewPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const { parent: parentId } = await searchParams;

  const session = await requireSession();

  const [ws] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!ws) {
    redirect(`/app/${slug}`);
  }

  const member = await getWorkspaceMember(ws.id, session.user.id);
  if (!member || member.role === "viewer") {
    redirect(`/app/${slug}`);
  }

  // Validate parentId belongs to this workspace
  const resolvedParentId = parentId ?? null;
  if (resolvedParentId) {
    const [parent] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(
        and(
          eq(pages.id, resolvedParentId),
          eq(pages.workspaceId, ws.id),
          eq(pages.isDeleted, false)
        )
      )
      .limit(1);
    if (!parent) {
      redirect(`/app/${slug}`);
    }
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(pages.orderIndex) })
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, ws.id),
        eq(pages.isDeleted, false),
        resolvedParentId
          ? eq(pages.parentId, resolvedParentId)
          : isNull(pages.parentId)
      )
    );

  const orderIndex = (maxOrder ?? -1) + 1;
  const shortId = createId().slice(0, 10);

  const newPage = await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(pages)
      .values({
        shortId,
        workspaceId: ws.id,
        parentId: resolvedParentId,
        kind: "page",
        title: "Untitled",
        orderIndex,
        createdBy: session.user.id,
        lastEditedBy: session.user.id,
      })
      .returning();

    await insertPageWithClosure(tx, page.id, resolvedParentId);

    await tx.insert(blocks).values({
      pageId: page.id,
      parentBlockId: null,
      type: "paragraph",
      content: { text: [], schemaVersion: 1 },
      schemaVersion: 1,
      orderIndex: 0,
      createdBy: session.user.id,
    });

    return page;
  });

  redirect(`/app/${slug}/${newPage.shortId}`);
}
