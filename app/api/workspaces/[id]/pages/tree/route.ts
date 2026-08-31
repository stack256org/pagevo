import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/pages/tree
// Returns a flat list of non-deleted pages; the client builds the tree.
// Privacy rule (Phase 4): show pages where is_private=false OR created_by=currentUser.
// Full BOLA enforcement deferred to Phase 12.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id);

    const rows = await db
      .select({
        id: pages.id,
        shortId: pages.shortId,
        parentId: pages.parentId,
        title: pages.title,
        icon: pages.icon,
        orderIndex: pages.orderIndex,
        kind: pages.kind,
        isPrivate: pages.isPrivate,
        isDraft: pages.isDraft,
      })
      .from(pages)
      .where(
        and(
          eq(pages.workspaceId, workspaceId),
          eq(pages.isDeleted, false),
          ne(pages.kind, "entry"),
          or(eq(pages.isPrivate, false), eq(pages.createdBy, session.user.id)),
          or(eq(pages.isDraft, false), eq(pages.createdBy, session.user.id))
        )
      )
      .orderBy(pages.orderIndex);

    return Response.json(rows);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
