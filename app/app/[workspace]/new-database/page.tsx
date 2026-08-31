import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseViews, pages, workspaces } from "@/lib/db/schema";
import { createPageWithClosure } from "@/lib/pages/closure";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ parent?: string }>;
};

export default async function NewDatabasePage({ params, searchParams }: Props) {
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

  const database = await db.transaction(async (tx) => {
    const page = await createPageWithClosure(tx, {
      workspaceId: ws.id,
      title: "Untitled Database",
      kind: "database",
      parentId: parentId ?? null,
      createdBy: session.user.id,
    });

    // Auto-create default Table view
    const [view] = await tx
      .insert(databaseViews)
      .values({
        databaseId: page.id,
        name: "Default View",
        type: "table",
        orderIndex: 0,
      })
      .returning();

    await tx
      .update(pages)
      .set({ defaultViewId: view.id })
      .where(eq(pages.id, page.id));

    return { ...page, defaultViewId: view.id };
  });

  redirect(`/app/${slug}/${database.shortId}`);
}
