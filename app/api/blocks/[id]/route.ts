import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blocks, blockType, pages } from "@/lib/db/schema";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

async function resolveBlock(blockId: string, userId: string) {
  const [block] = await db
    .select()
    .from(blocks)
    .where(eq(blocks.id, blockId))
    .limit(1);
  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  const [page] = await db
    .select({ workspaceId: pages.workspaceId, isDeleted: pages.isDeleted })
    .from(pages)
    .where(eq(pages.id, block.pageId))
    .limit(1);
  if (!page) {
    throw new ApiError(404, "Page not found");
  }
  if (page.isDeleted) {
    throw new ApiError(400, "Page is in Trash");
  }

  await requirePagePermission(userId, block.pageId, "can_edit");
  return block;
}

const patchSchema = z.object({
  // Validated against the block_type pg enum, not a bare string — otherwise an
  // unknown type passes validation and only fails at the database.
  type: z.enum(blockType.enumValues).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  orderIndex: z.number().int().min(0).optional(),
  parentBlockId: z.string().uuid().nullable().optional(),
});

// PATCH /api/blocks/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    await resolveBlock(id, session.user.id);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Invalid block update");
    }

    const updates: Partial<typeof blocks.$inferInsert> = {};
    if (parsed.data.type !== undefined) {
      updates.type = parsed.data.type;
    }
    if (parsed.data.content !== undefined) {
      updates.content = parsed.data.content;
    }
    if (parsed.data.orderIndex !== undefined) {
      updates.orderIndex = parsed.data.orderIndex;
    }
    if (parsed.data.parentBlockId !== undefined) {
      updates.parentBlockId = parsed.data.parentBlockId;
    }

    const [updated] = await db
      .update(blocks)
      .set(updates)
      .where(eq(blocks.id, id))
      .returning();

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/blocks/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    await resolveBlock(id, session.user.id);

    await db.delete(blocks).where(eq(blocks.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
