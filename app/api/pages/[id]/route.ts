import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { triggerPageUpdateNotification } from "@/lib/notifications/triggers";
import { deletePageCascade } from "@/lib/pages/delete-page";
import { isMeaningfulTitle } from "@/lib/pages/draft";
import { promoteDraftPage } from "@/lib/pages/promote-draft";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { upsertPageSearchIndex } from "@/lib/search/index-page";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pages/:id — fetch page by UUID or shortId
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);

    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, id, "can_view");

    return Response.json(page);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

const patchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    icon: z.string().nullable().optional(),
    coverUrl: z.string().nullable().optional(),
    coverPosition: z.number().min(0).max(1).optional(),
    isFullWidth: z.boolean().optional(),
    isSmallText: z.boolean().optional(),
    fontFamily: z.enum(["default", "serif", "mono"]).optional(),
    isPrivate: z.boolean().optional(),
  })
  .strict();

// PATCH /api/pages/:id — update page metadata
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        isDeleted: pages.isDeleted,
        isDraft: pages.isDraft,
        createdBy: pages.createdBy,
        lastEditedBy: pages.lastEditedBy,
        title: pages.title,
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

    await requirePagePermission(session.user.id, id, "can_edit");

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const willPromote =
      page.isDraft &&
      parsed.data.title !== undefined &&
      isMeaningfulTitle(parsed.data.title);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(pages)
        .set({
          ...parsed.data,
          lastEditedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(pages.id, id))
        .returning();

      if (willPromote) {
        const { promoted, page: promotedPage } = await promoteDraftPage(tx, id);
        if (promoted && promotedPage) {
          row.isDraft = promotedPage.isDraft;
        }
      }

      // Mirrors blocks/batch's notify-once throttle so a title-only edit still notifies (blocks/batch would otherwise see lastEditedBy already stamped and skip it). Drafts never notify.
      if (
        !page.isDraft &&
        page.createdBy &&
        session.user.id !== page.createdBy &&
        session.user.id !== page.lastEditedBy
      ) {
        await triggerPageUpdateNotification(tx, {
          workspaceId: page.workspaceId,
          pageId: id,
          editorId: session.user.id,
          createdBy: page.createdBy,
          pageTitle: row.title ?? page.title ?? "Untitled",
        });
      }

      return row;
    });

    // Keep search index current whenever title changes
    if (parsed.data.title !== undefined) {
      upsertPageSearchIndex(db, {
        id: updated.id,
        workspaceId: updated.workspaceId,
        title: updated.title,
        kind: updated.kind,
      }).catch(() => {});
    }

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/pages/:id
//   • Database page → always hard-delete (permanent); DB CASCADE removes entries/views/properties
//   • Regular page NOT in trash → soft delete (move to Trash, cascade to descendants)
//   • Regular page already in Trash → hard delete (permanent, cascades via ON DELETE CASCADE)
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    const result = await deletePageCascade(id, session.user.id);
    return Response.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
