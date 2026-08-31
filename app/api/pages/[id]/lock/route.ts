import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

// POST /api/pages/:id/lock — toggle page lock (requires editor+ on workspace for now;
// full permission check (Full Access level) deferred to Phase 12).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        isLocked: pages.isLocked,
        isDeleted: pages.isDeleted,
      })
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);

    if (!page) {
      return apiError(404, "Page not found");
    }
    if (page.isDeleted) {
      return apiError(404, "Page is in Trash");
    }

    await requireWorkspaceMember(page.workspaceId, session.user.id, "editor");

    const [updated] = await db
      .update(pages)
      .set({ isLocked: !page.isLocked, updatedAt: new Date() })
      .where(eq(pages.id, id))
      .returning({ isLocked: pages.isLocked });

    return Response.json({ isLocked: updated.isLocked });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
