import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageClosure, pages } from "@/lib/db/schema";

export interface PageAncestor {
  icon: string | null;
  id: string;
  shortId: string;
  title: string | null;
}

// Root → self order, using the closure table (page_closure) so this is a
// single indexed join instead of a recursive walk up parentId — see
// lib/pages/closure.ts for how that table is maintained.
export async function getPageAncestors(
  pageId: string
): Promise<PageAncestor[]> {
  const rows = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      icon: pages.icon,
      depth: pageClosure.depth,
    })
    .from(pageClosure)
    .innerJoin(pages, eq(pages.id, pageClosure.ancestorId))
    .where(
      and(
        eq(pageClosure.descendantId, pageId),
        gte(pageClosure.depth, 0),
        eq(pages.isDeleted, false)
      )
    )
    .orderBy(desc(pageClosure.depth));

  return rows.map(({ id, shortId, title, icon }) => ({
    id,
    shortId,
    title,
    icon,
  }));
}
