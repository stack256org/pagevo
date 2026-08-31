import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, pages } from "@/lib/db/schema";
import { triggerReopenedNotification } from "@/lib/notifications/triggers";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/comments/:id/reopen — reopen a resolved thread root
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [row] = await db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        pageId: comments.pageId,
        isResolved: comments.isResolved,
        workspaceId: pages.workspaceId,
      })
      .from(comments)
      .innerJoin(pages, eq(pages.id, comments.pageId))
      .where(eq(comments.id, id))
      .limit(1);

    if (!row) {
      return apiError(404, "Comment not found");
    }
    if (row.parentId !== null) {
      return apiError(400, "Only thread roots can be reopened");
    }

    await requirePagePermission(session.user.id, row.pageId, "can_comment");

    const [updated] = await db.transaction(async (tx) => {
      const result = await tx
        .update(comments)
        .set({ isResolved: false })
        .where(eq(comments.id, id))
        .returning({ id: comments.id, isResolved: comments.isResolved });

      await triggerReopenedNotification(tx, {
        commentId: id,
        pageId: row.pageId,
        workspaceId: row.workspaceId,
        reopenerId: session.user.id,
      });

      return result;
    });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[POST /api/comments/:id/reopen]", err);
    return apiError(500, "Internal server error");
  }
}
