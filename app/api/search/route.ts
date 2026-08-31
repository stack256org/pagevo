import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pageClosure,
  pages,
  searchIndex,
  searchQueryLog,
  templateCategories,
  templates,
  workspaceMembers,
} from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

export const runtime = "nodejs";

// GET /api/search?q=&workspaceId=&type=&date=&location=&author=&sort=
export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") ?? "").trim();
    const workspaceId = searchParams.get("workspaceId") ?? "";
    const type = searchParams.get("type") ?? "all"; // all | page | entry | comment | template
    const date = searchParams.get("date") ?? "any"; // any | 24h | 7d | 30d
    const location = searchParams.get("location") ?? "all"; // all | shared | private
    const author = searchParams.get("author") ?? "any"; // any | me_created | me_edited | <userId>
    const sort = searchParams.get("sort") ?? "relevance"; // relevance | edited | created

    if (!workspaceId) {
      return apiError(400, "workspaceId is required");
    }

    // Verify membership
    const [member] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .limit(1);
    if (!member) {
      return apiError(403, "Not a member of this workspace");
    }

    // Date filter — by the page's real last-edited time (pages.updatedAt), not
    // the index row's updatedAt. The index time is bumped to "now" for every
    // row on a reindex, which made the date filter useless (everything looked
    // recent) and never matched the "last edited" shown elsewhere.
    const dateFilter = (() => {
      if (date === "24h") {
        return sql`${pages.updatedAt} >= NOW() - INTERVAL '24 hours'`;
      }
      if (date === "7d") {
        return sql`${pages.updatedAt} >= NOW() - INTERVAL '7 days'`;
      }
      if (date === "30d") {
        return sql`${pages.updatedAt} >= NOW() - INTERVAL '30 days'`;
      }
      return null;
    })();

    // Type filter
    const typeFilter = (() => {
      if (type === "page") {
        return eq(searchIndex.sourceType, "page");
      }
      if (type === "entry") {
        return eq(searchIndex.sourceType, "entry");
      }
      if (type === "comment") {
        return eq(searchIndex.sourceType, "comment");
      }
      return null;
    })();
    // Templates live in their own table, not search_index — "template" is
    // handled as an entirely separate query below, so the page/entry/comment
    // query must return nothing when it's the only type selected.
    const isTemplateOnly = type === "template";
    const includeTemplates = type === "all" || isTemplateOnly;

    // Location filter — "Shared" / "Private" map directly onto pages.isPrivate.
    // Other users' private pages are already excluded below regardless of this
    // filter, so "Private" here effectively means "my own private pages."
    const locationFilter = (() => {
      if (location === "shared") {
        return eq(pages.isPrivate, false);
      }
      if (location === "private") {
        return eq(pages.isPrivate, true);
      }
      return null;
    })();

    // Author filter — "me_created"/"me_edited" scope to the current user;
    // anything else is treated as a specific member's user id (from the
    // picker), matched against who authored the page.
    const authorFilter = (() => {
      if (author === "me_created") {
        return eq(pages.createdBy, session.user.id);
      }
      if (author === "me_edited") {
        return eq(pages.lastEditedBy, session.user.id);
      }
      if (author !== "any") {
        return eq(pages.createdBy, author);
      }
      return null;
    })();

    // Build conditions
    const conditions = [
      eq(searchIndex.workspaceId, workspaceId),
      eq(pages.isDeleted, false),
      // Exclude other users' private pages
      or(eq(pages.isPrivate, false), eq(pages.createdBy, session.user.id)),
      // Exclude other users' unpromoted drafts
      or(eq(pages.isDraft, false), eq(pages.createdBy, session.user.id)),
    ];
    if (typeFilter) {
      conditions.push(typeFilter);
    }
    if (dateFilter) {
      conditions.push(dateFilter);
    }
    if (locationFilter) {
      conditions.push(locationFilter);
    }
    if (authorFilter) {
      conditions.push(authorFilter);
    }

    // Browse mode: an empty query is allowed when a filter is active (lists matching items instead of falling back to recently-visited). No query + no filter = nothing to browse.
    const hasAnyFilter =
      !!typeFilter ||
      isTemplateOnly ||
      !!dateFilter ||
      !!locationFilter ||
      !!authorFilter;
    if (!q && !hasAnyFilter) {
      return Response.json({ results: [], total: 0 });
    }

    // Build tsquery — split words, join with & prefix matching (only when the
    // user actually typed something).
    const words = q ? q.split(/\s+/).filter(Boolean) : [];
    const tsQuery = words
      .map((w) => `${w.replace(/[^a-zA-Z0-9]/g, "")}:*`)
      .join(" & ");
    // A non-empty query that reduces to an empty tsquery (all punctuation) matches nothing.
    if (q && !tsQuery) {
      return Response.json({ results: [], total: 0 });
    }

    // 'simple' config — must match how index-page.ts builds searchVector (see
    // the comment there for why: 'english' drops stop words like
    // "just"/"the"/"and" to zero lexemes, silently making titles that are or
    // contain one unsearchable).
    if (tsQuery) {
      conditions.push(
        sql`${searchIndex.searchVector} @@ to_tsquery('simple', ${tsQuery})`
      );
    }

    // Rank by text relevance when searching; browse mode has no query, so rank
    // is constant and results order purely by recency. An explicit "Last
    // edited" / "Created date" sort overrides relevance entirely.
    const rankExpr = tsQuery
      ? sql<number>`ts_rank(${searchIndex.searchVector}, to_tsquery('simple', ${tsQuery}))`
      : sql<number>`0`;
    const orderByCols = (() => {
      if (sort === "created") {
        return [desc(pages.createdAt)];
      }
      if (sort === "edited") {
        return [desc(pages.updatedAt)];
      }
      return tsQuery
        ? [desc(rankExpr), desc(pages.updatedAt)]
        : [desc(pages.updatedAt)];
    })();

    // "template" is an exclusive filter handled entirely by the templates
    // query below — search_index has no rows for templates, so skip this
    // query rather than run it just to join zero rows.
    const rows = isTemplateOnly
      ? []
      : await db
          .select({
            id: searchIndex.id,
            sourceType: searchIndex.sourceType,
            sourceId: searchIndex.sourceId,
            title: searchIndex.title,
            pageId: searchIndex.pageId,
            updatedAt: pages.updatedAt,
            createdAt: pages.createdAt,
            shortId: pages.shortId,
            icon: pages.icon,
            kind: pages.kind,
            rank: rankExpr,
          })
          .from(searchIndex)
          .innerJoin(pages, eq(pages.id, searchIndex.pageId))
          .where(and(...conditions))
          .orderBy(...orderByCols)
          .limit(50);

    // For each result, build a breadcrumb path
    const pageIds = [...new Set(rows.map((r) => r.pageId))];
    const breadcrumbMap = new Map<string, string>();

    if (pageIds.length > 0) {
      // Get ancestors for each page (depth desc = root first)
      const ancestors = await db
        .select({
          descendantId: pageClosure.descendantId,
          title: pages.title,
          depth: pageClosure.depth,
        })
        .from(pageClosure)
        .innerJoin(pages, eq(pages.id, pageClosure.ancestorId))
        .where(
          and(
            sql`${pageClosure.descendantId} = ANY(ARRAY[${sql.join(
              pageIds.map((id) => sql`${id}::uuid`),
              sql`, `
            )}])`,
            sql`${pageClosure.depth} > 0`,
            eq(pages.isDeleted, false)
          )
        )
        .orderBy(desc(pageClosure.depth));

      // Group ancestors by descendant
      const ancestorsByPage = new Map<
        string,
        { title: string; depth: number }[]
      >();
      for (const row of ancestors) {
        if (!ancestorsByPage.has(row.descendantId)) {
          ancestorsByPage.set(row.descendantId, []);
        }
        ancestorsByPage
          .get(row.descendantId)!
          .push({ title: row.title, depth: row.depth });
      }

      for (const pageId of pageIds) {
        const ancs = (ancestorsByPage.get(pageId) ?? []).sort(
          (a, b) => b.depth - a.depth
        );
        breadcrumbMap.set(
          pageId,
          ancs.map((a) => a.title || "Untitled").join(" / ")
        );
      }
    }

    type ResultRow = {
      id: string;
      sourceType: "page" | "entry" | "comment" | "template";
      sourceId: string;
      title: string;
      pageId: string;
      shortId: string;
      icon: string | null;
      kind: string;
      breadcrumb: string;
      updatedAt: Date;
      createdAt: Date;
      rank: number;
    };

    const pageResults: ResultRow[] = rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      title: r.title ?? "Untitled",
      pageId: r.pageId,
      shortId: r.shortId,
      icon: r.icon,
      kind: r.kind,
      breadcrumb: breadcrumbMap.get(r.pageId) ?? "",
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      rank: r.rank,
    }));

    // Templates aren't page-shaped (no owner/location/last-edited-by), so a location or "edited by me" filter excludes them entirely; they get their own ILIKE query, merged into the ranked results below.
    const includeTemplatesForFilters =
      includeTemplates && !locationFilter && author !== "me_edited";
    let templateResults: ResultRow[] = [];
    if (includeTemplatesForFilters) {
      const templateDateFilter = (() => {
        if (date === "24h") {
          return sql`${templates.updatedAt} >= NOW() - INTERVAL '24 hours'`;
        }
        if (date === "7d") {
          return sql`${templates.updatedAt} >= NOW() - INTERVAL '7 days'`;
        }
        if (date === "30d") {
          return sql`${templates.updatedAt} >= NOW() - INTERVAL '30 days'`;
        }
        return null;
      })();

      const templateConditions = [
        eq(templates.status, "published"),
        // Built-in templates (workspaceId null) plus this workspace's own.
        or(
          eq(templates.workspaceId, workspaceId),
          isNull(templates.workspaceId)
        ),
      ];
      if (templateDateFilter) {
        templateConditions.push(templateDateFilter);
      }
      if (author === "me_created") {
        templateConditions.push(eq(templates.createdBy, session.user.id));
      } else if (author !== "any") {
        templateConditions.push(eq(templates.createdBy, author));
      }
      if (q) {
        templateConditions.push(
          or(
            ilike(templates.name, `%${q}%`),
            ilike(templates.description, `%${q}%`)
          )
        );
      }

      const templateRows = await db
        .select({
          id: templates.id,
          name: templates.name,
          pageSnapshot: templates.pageSnapshot,
          updatedAt: templates.updatedAt,
          createdAt: templates.createdAt,
          categoryLabel: templateCategories.label,
        })
        .from(templates)
        .leftJoin(
          templateCategories,
          eq(templateCategories.id, templates.categoryId)
        )
        .where(and(...templateConditions))
        .orderBy(desc(templates.updatedAt))
        .limit(20);

      const needle = q.toLowerCase();
      templateResults = templateRows.map((t) => {
        const name = t.name.toLowerCase();
        const rank = q
          ? name === needle
            ? 1
            : name.startsWith(needle)
              ? 0.8
              : name.includes(needle)
                ? 0.5
                : 0.2
          : 0; // matched only via description
        const snapshot = t.pageSnapshot as { icon?: string | null } | null;
        return {
          id: t.id,
          sourceType: "template" as const,
          sourceId: t.id,
          title: t.name || "Untitled",
          pageId: "",
          shortId: "",
          icon: snapshot?.icon ?? null,
          kind: "template",
          breadcrumb: t.categoryLabel ?? "",
          updatedAt: t.updatedAt,
          createdAt: t.createdAt,
          rank,
        };
      });
    }

    // Final in-memory sort determines actual display order (pages + templates come from separate queries merged here) — must mirror whichever `sort` mode orderByCols used above.
    const compareResults = (a: ResultRow, b: ResultRow) => {
      if (sort === "created") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      if (sort === "edited") {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
      return (
        b.rank - a.rank ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    };
    const results = [...pageResults, ...templateResults]
      .sort(compareResults)
      .slice(0, 50);

    // Fire-and-forget — powers the Orbit Analytics "search usage & no-result
    // rate" metrics. Never awaited/blocking: a logging failure must never
    // affect the actual search response. Only real typed queries are logged;
    // filter-only browse (empty q) isn't a "search" for analytics purposes.
    if (q) {
      db.insert(searchQueryLog)
        .values({
          workspaceId,
          userId: session.user.id,
          query: q,
          resultCount: results.length,
        })
        .catch(() => {});
    }

    return Response.json({ results, total: results.length });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[search]", err);
    return apiError(500, "Internal server error");
  }
}
