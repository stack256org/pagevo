import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guestInvitations, pagePermissions, pages } from "@/lib/db/schema";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string; guestId: string }> };

// DELETE /api/pages/[id]/guests/[guestId] — revoke guest access
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id: pageId, guestId } = await params;
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

    // Remove invitation record
    await db
      .delete(guestInvitations)
      .where(
        and(
          eq(guestInvitations.id, guestId),
          eq(guestInvitations.pageId, pageId)
        )
      );

    // Also remove any page_permissions row created on acceptance (guestEmail match)
    const [inv] = await db
      .select({ email: guestInvitations.email })
      .from(guestInvitations)
      .where(eq(guestInvitations.id, guestId))
      .limit(1);

    if (inv?.email) {
      await db
        .delete(pagePermissions)
        .where(
          and(
            eq(pagePermissions.pageId, pageId),
            eq(pagePermissions.guestEmail, inv.email)
          )
        );
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
