import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TemplatePageClient } from "@/components/templates/template-page-client";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  comments,
  databaseProperties,
  databaseViews,
  pageClosure,
  pages,
  propertyValues,
  userFavorites,
  workspaces,
} from "@/lib/db/schema";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

type Props = { params: Promise<{ workspace: string; pageId: string }> };

export async function generateMetadata({ params }: Props) {
  const { pageId } = await params;
  const [page] = await db
    .select({ title: pages.title })
    .from(pages)
    .where(eq(pages.shortId, pageId))
    .limit(1);
  return { title: page?.title ?? "Template" };
}

export default async function TemplateDatabasePage({ params }: Props) {
  const { workspace: slug, pageId: shortId } = await params;
  const session = await requireSession();

  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!ws) {
    notFound();
  }

  const member = await getWorkspaceMember(ws.id, session.user.id);
  if (!member) {
    notFound();
  }

  const isEditor = member.role === "admin" || member.role === "editor";
  const isAdmin = member.role === "admin";

  const [page] = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      icon: pages.icon,
      coverUrl: pages.coverUrl,
      kind: pages.kind,
      defaultViewId: pages.defaultViewId,
      updatedAt: pages.updatedAt,
      isPrivate: pages.isPrivate,
      isLocked: pages.isLocked,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(and(eq(pages.shortId, shortId), eq(pages.workspaceId, ws.id)))
    .limit(1);
  if (!page) {
    notFound();
  }

  const [favRow] = await db
    .select({ id: userFavorites.id })
    .from(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, session.user.id),
        eq(userFavorites.pageId, page.id)
      )
    )
    .limit(1);
  const isFavorited = !!favRow;

  // Breadcrumbs — ancestors ordered root → parent
  const ancestorRows = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      depth: pageClosure.depth,
    })
    .from(pageClosure)
    .innerJoin(pages, eq(pages.id, pageClosure.ancestorId))
    .where(and(eq(pageClosure.descendantId, page.id), gt(pageClosure.depth, 0)))
    .orderBy(asc(pageClosure.depth));

  const breadcrumbs = ancestorRows
    .sort((a, b) => b.depth - a.depth)
    .map((r) => ({
      id: r.id,
      shortId: r.shortId,
      title: r.title || "Untitled",
    }));

  const props = await db
    .select()
    .from(databaseProperties)
    .where(eq(databaseProperties.databaseId, page.id))
    .orderBy(asc(databaseProperties.orderIndex));

  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, page.id))
    .orderBy(asc(databaseViews.orderIndex));

  const entries = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      icon: pages.icon,
      orderIndex: pages.orderIndex,
    })
    .from(pages)
    .where(
      and(
        eq(pages.databaseId, page.id),
        eq(pages.kind, "entry"),
        eq(pages.isDeleted, false)
      )
    )
    .orderBy(asc(pages.orderIndex));

  const entryIds = entries.map((e) => e.id);
  const values =
    entryIds.length > 0
      ? await db
          .select()
          .from(propertyValues)
          .where(inArray(propertyValues.entryId, entryIds))
      : [];

  // Open page-level comment count per entry, for the chat-icon badge. propertyId is
  // excluded since the badge's popover only shows page-level threads.
  const commentCountRows =
    entryIds.length > 0
      ? await db
          .select({
            pageId: comments.pageId,
            count: sql<number>`count(*)::int`,
          })
          .from(comments)
          .where(
            and(
              inArray(comments.pageId, entryIds),
              isNull(comments.parentId),
              isNull(comments.propertyId),
              eq(comments.isResolved, false),
              isNull(comments.deletedAt)
            )
          )
          .groupBy(comments.pageId)
      : [];
  const commentCountMap = new Map(
    commentCountRows.map((r) => [r.pageId, r.count])
  );
  const entriesWithCommentCounts = entries.map((e) => ({
    ...e,
    commentCount: commentCountMap.get(e.id) ?? 0,
  }));

  return (
    <TemplatePageClient
      breadcrumbs={breadcrumbs}
      currentUserEmail={session.user.email ?? null}
      currentUserId={session.user.id}
      currentUserImage={session.user.image ?? null}
      currentUserName={session.user.name ?? null}
      defaultViewId={page.defaultViewId ?? null}
      entries={entriesWithCommentCounts}
      isAdmin={isAdmin}
      isDeleted={page.isDeleted ?? false}
      isEditor={isEditor}
      isFavorited={isFavorited}
      isLocked={page.isLocked ?? false}
      isPrivate={page.isPrivate ?? false}
      page={{
        id: page.id,
        shortId: page.shortId,
        title: page.title,
        icon: page.icon,
        coverUrl: page.coverUrl,
        kind: page.kind,
        updatedAt: page.updatedAt
          ? new Date(page.updatedAt).toISOString()
          : null,
      }}
      properties={props}
      values={values}
      views={views}
      workspaceId={ws.id}
      workspaceName={ws.name}
      workspaceSlug={slug}
    />
  );
}
