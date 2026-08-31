import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CopyLinkButton } from "@/components/pages/copy-link-button";
import { FavoriteButton } from "@/components/pages/favorite-button";
import { PageActionsMenu } from "@/components/pages/page-actions-menu";
import { PageBreadcrumbs } from "@/components/pages/page-breadcrumbs";
import { PageClient } from "@/components/pages/page-client";
import { PageCommentButton } from "@/components/pages/page-comment-button";
import { PageDraftProvider } from "@/components/pages/page-draft-context";
import { PageDraftPill } from "@/components/pages/page-draft-pill";
import { PagePrivacyProvider } from "@/components/pages/page-privacy-context";
import { PagePrivacyPill } from "@/components/pages/page-privacy-pill";
import { PageSearchButton } from "@/components/pages/page-search-button";
import { ShareButton } from "@/components/pages/share-button";
import { TrashBanner } from "@/components/pages/trash-banner";
import { TemplatePageClient } from "@/components/templates/template-page-client";
import { TimeAgo } from "@/components/ui/time-ago";
import { requireSession } from "@/lib/authz";
import { computeDerivedValues } from "@/lib/databases/compute-values";
import { db } from "@/lib/db";
import {
  comments,
  databaseProperties,
  databaseViews,
  pageClosure,
  pages,
  propertyValues,
  userFavorites,
  userRecentlyVisited,
  workspaces,
} from "@/lib/db/schema";
import { isPageNavSource } from "@/lib/pages/navigation-source";
import { getEffectivePermission } from "@/lib/permissions/resolver";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

type Props = {
  params: Promise<{ workspace: string; pageId: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { pageId } = await params;
  const [page] = await db
    .select({ title: pages.title })
    .from(pages)
    .where(eq(pages.shortId, pageId))
    .limit(1);
  return { title: page?.title ?? "Page" };
}

export default async function PageEditorPage({ params, searchParams }: Props) {
  const { workspace: slug, pageId: shortId } = await params;
  const { from } = await searchParams;
  const navSource = isPageNavSource(from) ? from : undefined;
  const session = await requireSession();

  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!ws) {
    notFound();
  }

  // No `if (!member) notFound()` — page-only guests have no workspaceMembers row;
  // getEffectivePermission below is their sole access gate.
  const member = await getWorkspaceMember(ws.id, session.user.id);

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.shortId, shortId), eq(pages.workspaceId, ws.id)))
    .limit(1);
  if (!page) {
    notFound();
  }

  // Enforce per-page permission (Hard Rule 3) — workspace membership alone isn't
  // enough for private pages/permission ceilings. Denied looks like nonexistent.
  const effectiveLevel = await getEffectivePermission(session.user.id, page.id);
  if (!effectiveLevel) {
    notFound();
  }

  // Record visit (fire-and-forget)
  db.insert(userRecentlyVisited)
    .values({ userId: session.user.id, workspaceId: ws.id, pageId: page.id })
    .onConflictDoUpdate({
      target: [userRecentlyVisited.userId, userRecentlyVisited.pageId],
      set: { visitedAt: new Date() },
    })
    .catch(() => {});

  // Breadcrumbs — ancestors root → parent
  const ancestorRows = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      icon: pages.icon,
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
      icon: r.icon,
    }));

  // Delete fallback for a root-level page (no parent): the nearest other
  // top-level item — previous in sidebar order, or next if this was first.
  let rootFallbackShortId: string | null = null;
  if (breadcrumbs.length === 0) {
    const [prevSibling] = await db
      .select({ shortId: pages.shortId })
      .from(pages)
      .where(
        and(
          eq(pages.workspaceId, ws.id),
          eq(pages.isDeleted, false),
          isNull(pages.parentId),
          lt(pages.orderIndex, page.orderIndex)
        )
      )
      .orderBy(desc(pages.orderIndex))
      .limit(1);

    if (prevSibling) {
      rootFallbackShortId = prevSibling.shortId;
    } else {
      const [nextSibling] = await db
        .select({ shortId: pages.shortId })
        .from(pages)
        .where(
          and(
            eq(pages.workspaceId, ws.id),
            eq(pages.isDeleted, false),
            isNull(pages.parentId),
            gt(pages.orderIndex, page.orderIndex)
          )
        )
        .orderBy(asc(pages.orderIndex))
        .limit(1);
      rootFallbackShortId = nextSibling?.shortId ?? null;
    }
  }

  const isEditor =
    effectiveLevel === "can_edit" || effectiveLevel === "full_access";
  const isAdmin = member?.role === "admin";

  // Check if page is in user's favorites
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

  // ── Database pages → TemplatePageClient (Notion-style, no stats bar) ─────────
  if (page.kind === "database") {
    const [props, views, entries] = await Promise.all([
      db
        .select()
        .from(databaseProperties)
        .where(eq(databaseProperties.databaseId, page.id))
        .orderBy(asc(databaseProperties.orderIndex)),
      db
        .select()
        .from(databaseViews)
        .where(eq(databaseViews.databaseId, page.id))
        .orderBy(asc(databaseViews.orderIndex)),
      db
        .select({
          id: pages.id,
          shortId: pages.shortId,
          title: pages.title,
          icon: pages.icon,
          orderIndex: pages.orderIndex,
          updatedAt: pages.updatedAt,
          createdBy: pages.createdBy,
        })
        .from(pages)
        .where(
          and(
            eq(pages.databaseId, page.id),
            eq(pages.kind, "entry"),
            eq(pages.isDeleted, false)
          )
        )
        .orderBy(asc(pages.orderIndex)),
    ]);

    const entryIds = entries.map((e) => e.id);
    const storedValues =
      entryIds.length > 0
        ? await db
            .select()
            .from(propertyValues)
            .where(inArray(propertyValues.entryId, entryIds))
        : [];

    // Rollup, Created-by, and Formula properties are computed, not stored —
    // same helper the live entries API route uses (lib/databases/compute-values.ts)
    // — so this initial server render already shows them instead of only
    // populating after the client's first view-switch fetch.
    const valMap = new Map<string, Map<string, unknown>>();
    for (const v of storedValues) {
      if (!valMap.has(v.entryId)) {
        valMap.set(v.entryId, new Map());
      }
      valMap.get(v.entryId)!.set(v.propertyId, v.value);
    }
    const computedValues =
      entryIds.length > 0
        ? await computeDerivedValues(props, entries, valMap)
        : [];
    const values = [
      ...storedValues,
      ...computedValues.map((cv) => ({
        id: `computed:${cv.propertyId}:${cv.entryId}`,
        entryId: cv.entryId,
        propertyId: cv.propertyId,
        value: cv.value,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
    ];

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

    const lockedBanner = page.isLocked && (
      <div className="mb-5 flex items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
        This page is <strong className="ml-1">locked</strong> — editing is
        disabled.
      </div>
    );

    return (
      <TemplatePageClient
        breadcrumbs={breadcrumbs}
        currentUserEmail={session.user.email ?? null}
        currentUserId={session.user.id}
        currentUserImage={session.user.image ?? null}
        currentUserName={session.user.name ?? null}
        defaultViewId={page.defaultViewId ?? null}
        entries={entries.map((e) => ({
          ...e,
          updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : null,
          commentCount: commentCountMap.get(e.id) ?? 0,
        }))}
        isAdmin={isAdmin}
        isDeleted={page.isDeleted ?? false}
        isEditor={isEditor}
        isFavorited={isFavorited}
        isLocked={page.isLocked ?? false}
        isPrivate={page.isPrivate ?? false}
        // Forces a full remount on nav between database pages — state is seeded via
        // useState() only on mount, so reuse would show stale data.
        key={page.id}
        lockedBanner={lockedBanner}
        navSource={navSource}
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
        rootFallbackShortId={rootFallbackShortId}
        values={values}
        views={views}
        workspaceId={ws.id}
        workspaceName={ws.name}
        workspaceSlug={slug}
      />
    );
  }

  // ── Regular / doc pages → PageClient ─────────────────────────────────────────
  const statusBanner = (
    <>
      {page.isDeleted && (
        <TrashBanner
          pageId={page.id}
          parentShortId={breadcrumbs[breadcrumbs.length - 1]?.shortId ?? null}
          rootFallbackShortId={rootFallbackShortId}
          workspaceSlug={slug}
        />
      )}
      {page.isLocked && (
        <div className="mb-5 flex items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          This page is <strong className="ml-1">locked</strong> — editing is
          disabled.
        </div>
      )}
    </>
  );

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-base-100"
      data-page-id={page.id}
    >
      <PageDraftProvider initialIsDraft={page.isDraft}>
        {/* ── Topbar ── */}
        <PagePrivacyProvider initialIsPrivate={page.isPrivate}>
          <div className="flex h-11 shrink-0 items-center justify-between bg-base-100 px-3">
            {/* Breadcrumbs */}
            <div className="flex min-w-0 items-center">
              <PageBreadcrumbs
                ancestors={breadcrumbs}
                currentPageId={page.id}
                initialIcon={page.icon}
                initialTitle={page.title}
                navSource={navSource}
                workspaceName={ws.name}
                workspaceSlug={slug}
              />
              <PagePrivacyPill />
              <PageDraftPill />
            </div>

            {/* Actions */}
            <div className="ml-2 flex shrink-0 items-center gap-1">
              {page.updatedAt && (
                <span className="mr-1.5 whitespace-nowrap text-xs text-base-content/70">
                  Edited{" "}
                  <TimeAgo iso={new Date(page.updatedAt).toISOString()} />
                </span>
              )}
              <ShareButton
                currentUserEmail={session.user.email ?? null}
                currentUserId={session.user.id}
                currentUserImage={session.user.image ?? null}
                currentUserName={session.user.name ?? null}
                isEditor={isEditor}
                pageId={page.id}
                pageShortId={page.shortId}
                workspaceSlug={slug}
              />
              <CopyLinkButton pageId={page.id} />
              <PageSearchButton />
              <PageCommentButton
                currentUserId={session.user.id}
                isAdmin={isAdmin}
                pageId={page.id}
                workspaceId={ws.id}
              />
              <FavoriteButton
                isFavorited={isFavorited}
                pageId={page.id}
                workspaceId={ws.id}
              />
              {isEditor && (
                <PageActionsMenu
                  iconOnly
                  isDeleted={page.isDeleted}
                  isLocked={page.isLocked}
                  pageId={page.id}
                  pageKind={page.kind}
                  pageShortId={page.shortId}
                  pageTitle={page.title ?? ""}
                  parentShortId={
                    breadcrumbs[breadcrumbs.length - 1]?.shortId ?? null
                  }
                  rootFallbackShortId={rootFallbackShortId}
                  workspaceId={ws.id}
                  workspaceSlug={slug}
                />
              )}
            </div>
          </div>
        </PagePrivacyProvider>

        <PageClient
          currentUserId={session.user.id}
          databaseId={page.databaseId}
          fontFamily={page.fontFamily}
          initialCoverPosition={page.coverPosition}
          initialCoverUrl={page.coverUrl}
          initialIcon={page.icon}
          initialTitle={page.title}
          isAdmin={isAdmin}
          isDeleted={page.isDeleted}
          isEditor={isEditor}
          isFullWidth={page.isFullWidth}
          isLocked={page.isLocked}
          isSmallText={page.isSmallText}
          pageId={page.id}
          shortId={page.shortId}
          statusBanner={statusBanner}
          workspaceId={ws.id}
          workspaceSlug={slug}
        />
      </PageDraftProvider>
    </div>
  );
}
