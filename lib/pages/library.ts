import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pageClosure,
  pages,
  userFavorites,
  userRecentlyVisited,
  users,
} from "@/lib/db/schema";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/lib/ui/pagination";

export type LibraryTab = "all" | "recents" | "favorites" | "private";

export type LibraryPageRow = {
  id: string;
  shortId: string;
  title: string;
  icon: string | null;
  kind: string;
  isPrivate: boolean;
  isLocked: boolean;
  parentId: string | null;
  parentShortId: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  visitedAt: string | null;
  isRecent: boolean;
  isFavorited: boolean;
};

export type LibraryPageResult = {
  pages: LibraryPageRow[];
  totalCount: number;
  nestingActive: boolean;
  tabCounts: {
    all: number;
    recents: number;
    favorites: number;
    private: number;
  };
};

// A page counts as a "root" for the All-Pages tree view if it has no parent,
// or its parent isn't a live (non-deleted) page — mirrors the client's old
// in-memory root rule (parent missing from the already-fetched page set),
// just expressed against the whole table instead of one in-memory array.
const ROOT_CONDITION = sql`(${pages.parentId} IS NULL OR NOT EXISTS (
  SELECT 1 FROM pages parent WHERE parent.id = ${pages.parentId} AND parent.is_deleted = false
))`;

const selectCols = {
  id: pages.id,
  shortId: pages.shortId,
  title: pages.title,
  icon: pages.icon,
  kind: pages.kind,
  isPrivate: pages.isPrivate,
  isLocked: pages.isLocked,
  parentId: pages.parentId,
  createdAt: pages.createdAt,
  updatedAt: pages.updatedAt,
  creatorName: sql<string>`coalesce(${users.name}, ${users.email}, 'Unknown')`,
};

type Row = {
  id: string;
  shortId: string;
  title: string;
  icon: string | null;
  kind: string;
  isPrivate: boolean;
  isLocked: boolean;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  creatorName: string;
};

// Server-side pagination for the Library table. "All Pages" (no search) paginates by ROOT page and attaches
// descendants via page_closure, so pageSize means "N roots" not "N rows"; every other case paginates flat.
export async function getLibraryPage(
  workspaceId: string,
  userId: string,
  opts: {
    tab?: string | null;
    search?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<LibraryPageResult> {
  const tab: LibraryTab =
    opts.tab === "recents" || opts.tab === "favorites" || opts.tab === "private"
      ? opts.tab
      : "all";
  const search = (opts.search ?? "").trim();
  const pageNum =
    opts.page && Number.isFinite(opts.page) && opts.page > 0 ? opts.page : 1;
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      MIN_PAGE_SIZE,
      opts.pageSize && Number.isFinite(opts.pageSize)
        ? opts.pageSize
        : DEFAULT_PAGE_SIZE
    )
  );

  // Recently-visited and favorited page ids for this user+workspace — needed
  // both for tab filtering below and for the isRecent/isFavorited/visitedAt
  // flags on every returned row. Same 50-row cap the old page.tsx used.
  const recentRows = await db
    .select({
      pageId: userRecentlyVisited.pageId,
      visitedAt: userRecentlyVisited.visitedAt,
    })
    .from(userRecentlyVisited)
    .where(
      and(
        eq(userRecentlyVisited.userId, userId),
        eq(userRecentlyVisited.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(userRecentlyVisited.visitedAt))
    .limit(50);
  const recentPageIds = recentRows.map((r) => r.pageId);
  const visitedAtMap = Object.fromEntries(
    recentRows.map((r) => [r.pageId, r.visitedAt.toISOString()])
  );

  const favRows = await db
    .select({ pageId: userFavorites.pageId })
    .from(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.workspaceId, workspaceId)
      )
    );
  const favPageIds = favRows.map((f) => f.pageId);

  const baseConditions = [
    eq(pages.workspaceId, workspaceId),
    eq(pages.isDeleted, false),
  ];
  if (tab === "recents") {
    baseConditions.push(
      recentPageIds.length > 0 ? inArray(pages.id, recentPageIds) : sql`false`
    );
  }
  if (tab === "favorites") {
    baseConditions.push(
      favPageIds.length > 0 ? inArray(pages.id, favPageIds) : sql`false`
    );
  }
  if (tab === "private") {
    baseConditions.push(eq(pages.isPrivate, true));
  }

  const searchCondition = search
    ? or(
        ilike(pages.title, `%${search}%`),
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`)
      )
    : null;

  // Nesting only makes sense for the unfiltered "All Pages" list — same
  // condition the client used to gate its own tree-building.
  const nestingActive = tab === "all" && !search;

  let rows: Row[];
  let totalCount: number;

  if (nestingActive) {
    const rootConditions = [...baseConditions, ROOT_CONDITION];

    const [{ value: rootTotal }] = await db
      .select({ value: count(pages.id) })
      .from(pages)
      .where(and(...rootConditions));
    totalCount = Number(rootTotal);

    const rootRows = await db
      .select(selectCols)
      .from(pages)
      .leftJoin(users, eq(users.id, pages.createdBy))
      .where(and(...rootConditions))
      .orderBy(desc(pages.updatedAt))
      .limit(pageSize)
      .offset((pageNum - 1) * pageSize);

    const rootIds = rootRows.map((r) => r.id);
    const descendantRows =
      rootIds.length > 0
        ? await db
            .select(selectCols)
            .from(pageClosure)
            .innerJoin(pages, eq(pages.id, pageClosure.descendantId))
            .leftJoin(users, eq(users.id, pages.createdBy))
            .where(
              and(
                inArray(pageClosure.ancestorId, rootIds),
                sql`${pageClosure.depth} > 0`,
                eq(pages.isDeleted, false)
              )
            )
            .orderBy(desc(pages.updatedAt))
        : [];

    rows = [...rootRows, ...descendantRows];
  } else {
    const conditions = searchCondition
      ? [...baseConditions, searchCondition]
      : baseConditions;

    const [{ value: matchTotal }] = await db
      .select({ value: count(pages.id) })
      .from(pages)
      .leftJoin(users, eq(users.id, pages.createdBy))
      .where(and(...conditions));
    totalCount = Number(matchTotal);

    rows = await db
      .select(selectCols)
      .from(pages)
      .leftJoin(users, eq(users.id, pages.createdBy))
      .where(and(...conditions))
      .orderBy(desc(pages.updatedAt))
      .limit(pageSize)
      .offset((pageNum - 1) * pageSize);
  }

  // Parent shortIds — PageActionsMenu needs the parent's shortId to know
  // where to redirect after a page is trashed. Only looked up for the
  // parents of rows actually returned, not the whole workspace.
  const parentIds = [
    ...new Set(rows.map((r) => r.parentId).filter(Boolean) as string[]),
  ];
  const parentRows =
    parentIds.length > 0
      ? await db
          .select({ id: pages.id, shortId: pages.shortId })
          .from(pages)
          .where(inArray(pages.id, parentIds))
      : [];
  const parentShortIdMap = Object.fromEntries(
    parentRows.map((p) => [p.id, p.shortId])
  );

  const enriched: LibraryPageRow[] = rows.map((p) => ({
    id: p.id,
    shortId: p.shortId,
    title: p.title,
    icon: p.icon,
    kind: p.kind,
    isPrivate: p.isPrivate,
    isLocked: p.isLocked,
    parentId: p.parentId,
    parentShortId: p.parentId ? (parentShortIdMap[p.parentId] ?? null) : null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    creatorName: p.creatorName,
    visitedAt: visitedAtMap[p.id] ?? null,
    isRecent: recentPageIds.includes(p.id),
    isFavorited: favPageIds.includes(p.id),
  }));

  // Tab counts — always all four, regardless of which tab is active, so the
  // tab-bar badges stay accurate no matter what's currently being viewed.
  const [{ value: allCount }] = await db
    .select({ value: count(pages.id) })
    .from(pages)
    .where(and(eq(pages.workspaceId, workspaceId), eq(pages.isDeleted, false)));
  const [{ value: recentsCount }] =
    recentPageIds.length > 0
      ? await db
          .select({ value: count(pages.id) })
          .from(pages)
          .where(
            and(
              eq(pages.workspaceId, workspaceId),
              eq(pages.isDeleted, false),
              inArray(pages.id, recentPageIds)
            )
          )
      : [{ value: 0 }];
  const [{ value: favoritesCount }] =
    favPageIds.length > 0
      ? await db
          .select({ value: count(pages.id) })
          .from(pages)
          .where(
            and(
              eq(pages.workspaceId, workspaceId),
              eq(pages.isDeleted, false),
              inArray(pages.id, favPageIds)
            )
          )
      : [{ value: 0 }];
  const [{ value: privateCount }] = await db
    .select({ value: count(pages.id) })
    .from(pages)
    .where(
      and(
        eq(pages.workspaceId, workspaceId),
        eq(pages.isDeleted, false),
        eq(pages.isPrivate, true)
      )
    );

  return {
    pages: enriched,
    totalCount,
    nestingActive,
    tabCounts: {
      all: Number(allCount),
      recents: Number(recentsCount),
      favorites: Number(favoritesCount),
      private: Number(privateCount),
    },
  };
}

// Every id matching the current tab/search — unpaginated, id-only — so
// Library's "select all" can select every matching page, not just whatever
// happens to be loaded for the current page-size/pagination window (and,
// for the nested "All Pages" tree, not just whatever's currently expanded).
export async function getAllLibraryPageIds(
  workspaceId: string,
  userId: string,
  opts: { tab?: string | null; search?: string }
): Promise<string[]> {
  const tab: LibraryTab =
    opts.tab === "recents" || opts.tab === "favorites" || opts.tab === "private"
      ? opts.tab
      : "all";
  const search = (opts.search ?? "").trim();

  // Unfiltered "All Pages" — every non-deleted page in the workspace,
  // root or descendant alike. Matches tabCounts.all's own query exactly.
  if (tab === "all" && !search) {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .where(
        and(eq(pages.workspaceId, workspaceId), eq(pages.isDeleted, false))
      );
    return rows.map((r) => r.id);
  }

  const recentPageIds =
    tab === "recents"
      ? (
          await db
            .select({ pageId: userRecentlyVisited.pageId })
            .from(userRecentlyVisited)
            .where(
              and(
                eq(userRecentlyVisited.userId, userId),
                eq(userRecentlyVisited.workspaceId, workspaceId)
              )
            )
        ).map((r) => r.pageId)
      : [];
  const favPageIds =
    tab === "favorites"
      ? (
          await db
            .select({ pageId: userFavorites.pageId })
            .from(userFavorites)
            .where(
              and(
                eq(userFavorites.userId, userId),
                eq(userFavorites.workspaceId, workspaceId)
              )
            )
        ).map((f) => f.pageId)
      : [];

  const baseConditions = [
    eq(pages.workspaceId, workspaceId),
    eq(pages.isDeleted, false),
  ];
  if (tab === "recents") {
    baseConditions.push(
      recentPageIds.length > 0 ? inArray(pages.id, recentPageIds) : sql`false`
    );
  }
  if (tab === "favorites") {
    baseConditions.push(
      favPageIds.length > 0 ? inArray(pages.id, favPageIds) : sql`false`
    );
  }
  if (tab === "private") {
    baseConditions.push(eq(pages.isPrivate, true));
  }

  const searchCondition = search
    ? or(
        ilike(pages.title, `%${search}%`),
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`)
      )
    : null;
  const conditions = searchCondition
    ? [...baseConditions, searchCondition]
    : baseConditions;

  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .leftJoin(users, eq(users.id, pages.createdBy))
    .where(and(...conditions));
  return rows.map((r) => r.id);
}
