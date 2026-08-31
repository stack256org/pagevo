import { eq } from "drizzle-orm";
import { blocksToTiptapNodes } from "@/components/editor/serializer";
import { db } from "@/lib/db";
import { blocks, pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/blocks/:id/synced-content — read-only resolution of a synced
// block's source content, for reference instances (Synced Block v1: source +
// read-through view, re-fetched on each mount, not push-realtime).
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [source] = await db
      .select()
      .from(blocks)
      .where(eq(blocks.id, id))
      .limit(1);
    if (!source) {
      return apiError(404, "Source block not found");
    }

    const [page] = await db
      .select({
        id: pages.id,
        title: pages.title,
        workspaceId: pages.workspaceId,
        isDeleted: pages.isDeleted,
      })
      .from(pages)
      .where(eq(pages.id, source.pageId))
      .limit(1);
    if (!page || page.isDeleted) {
      return apiError(404, "Source page not found");
    }

    await requireWorkspaceMember(page.workspaceId, session.user.id);

    const pageBlocks = await db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, page.id));
    const content = blocksToTiptapNodes(
      pageBlocks.map((b) => ({
        id: b.id,
        content: b.content as Record<string, unknown>,
        orderIndex: b.orderIndex,
        parentBlockId: b.parentBlockId,
        type: b.type,
      })),
      source.id
    );

    return Response.json({
      sourcePageId: page.id,
      sourcePageTitle: page.title,
      content,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
