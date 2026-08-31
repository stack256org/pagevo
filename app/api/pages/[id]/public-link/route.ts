import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages, publicLinks } from "@/lib/db/schema";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pages/[id]/public-link
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    const [link] = await db
      .select()
      .from(publicLinks)
      .where(eq(publicLinks.pageId, pageId))
      .limit(1);

    return Response.json({ link: link ?? null });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

const updateSchema = z.object({
  isActive: z.boolean(),
  accessLevel: z.enum(["can_view", "can_comment"]).optional(),
});

// POST /api/pages/[id]/public-link — enable / update
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0].message);
    }

    const { isActive, accessLevel } = parsed.data;

    const [existing] = await db
      .select({ id: publicLinks.id, isActive: publicLinks.isActive })
      .from(publicLinks)
      .where(eq(publicLinks.pageId, pageId))
      .limit(1);

    if (!existing) {
      // First time enabling — create with fresh token
      const [created] = await db
        .insert(publicLinks)
        .values({
          pageId,
          token: nanoid(21),
          accessLevel: accessLevel ?? "can_view",
          isActive,
          createdBy: session.user.id,
        })
        .returning();
      return Response.json({ link: created });
    }

    // Re-enabling after disable → generate NEW token (old URL permanently dead)
    const wasDisabled = !existing.isActive && isActive;
    const [updated] = await db
      .update(publicLinks)
      .set({
        isActive,
        ...(accessLevel ? { accessLevel } : {}),
        ...(wasDisabled ? { token: nanoid(21) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(publicLinks.id, existing.id))
      .returning();

    return Response.json({ link: updated });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/pages/[id]/public-link — disable immediately
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    await requirePagePermission(session.user.id, pageId, "full_access");

    await db
      .update(publicLinks)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(publicLinks.pageId, pageId));

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
