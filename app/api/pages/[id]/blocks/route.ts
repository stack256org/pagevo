import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blocks, pages } from "@/lib/db/schema";
import type { AccessLevel } from "@/lib/permissions/resolver";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

async function resolvePage(
  pageId: string,
  userId: string,
  minLevel: AccessLevel
) {
  const [page] = await db
    .select({
      id: pages.id,
      workspaceId: pages.workspaceId,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) {
    throw new ApiError(404, "Page not found");
  }
  await requirePagePermission(userId, pageId, minLevel);
  return page;
}

// GET /api/pages/:id/blocks — load all blocks for the editor
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    await resolvePage(id, session.user.id, "can_view");

    const rows = await db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, id))
      .orderBy(asc(blocks.orderIndex));

    return Response.json(rows);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const createBlockSchema = z.object({
  id: z.string().uuid().optional(),
  parentBlockId: z.string().uuid().nullable().optional(),
  type: z.string(),
  content: z.record(z.string(), z.unknown()),
  orderIndex: z.number().int().min(0),
});

// POST /api/pages/:id/blocks — create a single block (slash menu insert)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const page = await resolvePage(id, session.user.id, "can_edit");
    if (page.isDeleted) {
      return apiError(400, "Page is in Trash");
    }

    const body = await req.json();
    const parsed = createBlockSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Invalid block data");
    }

    const { parentBlockId, type, content, orderIndex } = parsed.data;

    const [block] = await db
      .insert(blocks)
      .values({
        pageId: id,
        parentBlockId: parentBlockId ?? null,
        type: type as "paragraph",
        content: content as Record<string, unknown>,
        schemaVersion: 1,
        orderIndex,
        createdBy: session.user.id,
      })
      .returning();

    return Response.json(block, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
