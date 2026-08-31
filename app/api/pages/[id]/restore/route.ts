import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageClosure, pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/pages/:id/restore
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        isDeleted: pages.isDeleted,
        parentId: pages.parentId,
      })
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);

    if (!page) {
      return apiError(404, "Page not found");
    }
    if (!page.isDeleted) {
      return apiError(409, "Page is not in Trash");
    }

    await requireWorkspaceMember(page.workspaceId, session.user.id, "editor");

    // If the original parent is also deleted, restore to workspace root (parentId = null)
    let restoredParentId: string | null = page.parentId;
    if (restoredParentId) {
      const [parent] = await db
        .select({ isDeleted: pages.isDeleted })
        .from(pages)
        .where(eq(pages.id, restoredParentId))
        .limit(1);
      if (!parent || parent.isDeleted) {
        restoredParentId = null;
      }
    }

    // Restore only the target page itself (not its descendants — they were trashed together,
    // user can restore each descendant individually if desired, or they come along here)
    // Per spec: restore moves page back to original parent (or workspace root if parent also deleted)
    const descendants = await db
      .select({ descendantId: pageClosure.descendantId })
      .from(pageClosure)
      .where(eq(pageClosure.ancestorId, id));

    const descendantIds = descendants.map((d) => d.descendantId);

    await db
      .update(pages)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(inArray(pages.id, descendantIds));

    // If parent changed, update parentId for the root page only
    if (restoredParentId !== page.parentId) {
      await db
        .update(pages)
        .set({ parentId: restoredParentId })
        .where(eq(pages.id, id));
    }

    return Response.json({ success: true, parentId: restoredParentId });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
