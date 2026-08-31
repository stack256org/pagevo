import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, searchIndex } from "@/lib/db/schema";
import { upsertPageSearchIndex } from "@/lib/search/index-page";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

export const runtime = "nodejs";

// POST /api/search/reindex?workspaceId=xxx
// Backfills search_index for all non-deleted pages in the workspace.
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";

    if (!workspaceId) {
      return apiError(400, "workspaceId is required");
    }

    await requireWorkspaceMember(workspaceId, session.user.id);

    const allPages = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        title: pages.title,
        kind: pages.kind,
      })
      .from(pages)
      .where(
        and(eq(pages.workspaceId, workspaceId), eq(pages.isDeleted, false))
      );

    // Clean rebuild: drop the workspace's existing index rows first so that
    // pages previously mis-classified (all as "page") are re-inserted with the
    // correct sourceType. upsertPageSearchIndex derives the type from `kind`.
    await db
      .delete(searchIndex)
      .where(eq(searchIndex.workspaceId, workspaceId));

    let count = 0;
    for (const page of allPages) {
      await upsertPageSearchIndex(db, page);
      count++;
    }

    return Response.json({ indexed: count });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[reindex]", err);
    return apiError(500, "Internal server error");
  }
}
