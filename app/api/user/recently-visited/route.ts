import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages, userRecentlyVisited } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

// GET /api/user/recently-visited?workspaceId=xxx
// Returns last 10 unique pages visited in the given workspace, newest first.
export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return apiError(400, "workspaceId is required");
    }

    const rows = await db
      .select({
        id: userRecentlyVisited.id,
        pageId: userRecentlyVisited.pageId,
        visitedAt: userRecentlyVisited.visitedAt,
        page: {
          shortId: pages.shortId,
          title: pages.title,
          icon: pages.icon,
          kind: pages.kind,
        },
      })
      .from(userRecentlyVisited)
      .innerJoin(
        pages,
        and(
          eq(pages.id, userRecentlyVisited.pageId),
          eq(pages.isDeleted, false)
        )
      )
      .where(
        and(
          eq(userRecentlyVisited.userId, session.user.id),
          eq(userRecentlyVisited.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(userRecentlyVisited.visitedAt))
      .limit(10);

    return Response.json(rows);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/user/recently-visited?workspaceId=xxx
// Clears all recently-visited entries for the user in the given workspace.
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return apiError(400, "workspaceId is required");
    }

    await db
      .delete(userRecentlyVisited)
      .where(
        and(
          eq(userRecentlyVisited.userId, session.user.id),
          eq(userRecentlyVisited.workspaceId, workspaceId)
        )
      );

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const postSchema = z.object({
  pageId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

// POST /api/user/recently-visited
// Upserts a visit entry (updates visitedAt if page already in list).
export async function POST(req: Request) {
  try {
    const session = await getSession();

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { pageId, workspaceId } = parsed.data;

    await db
      .insert(userRecentlyVisited)
      .values({
        userId: session.user.id,
        pageId,
        workspaceId,
        visitedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userRecentlyVisited.userId, userRecentlyVisited.pageId],
        set: { visitedAt: new Date() },
      });

    // Prune to 10 entries per user+workspace (remove oldest beyond the cap)
    const all = await db
      .select({ id: userRecentlyVisited.id })
      .from(userRecentlyVisited)
      .where(
        and(
          eq(userRecentlyVisited.userId, session.user.id),
          eq(userRecentlyVisited.workspaceId, workspaceId)
        )
      )
      .orderBy(desc(userRecentlyVisited.visitedAt));

    if (all.length > 10) {
      const toDelete = all.slice(10).map((r) => r.id);
      for (const id of toDelete) {
        await db
          .delete(userRecentlyVisited)
          .where(eq(userRecentlyVisited.id, id));
      }
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
