import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  guestInvitations,
  pagePermissions,
  pages,
  users,
  workspaces,
} from "@/lib/db/schema";
import { triggerGuestAcceptedNotification } from "@/lib/notifications/triggers";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ token: string }> };

// GET /api/invite/guest/[token] — validate token and return page info
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { token } = await params;

    const [inv] = await db
      .select({
        id: guestInvitations.id,
        email: guestInvitations.email,
        accessLevel: guestInvitations.accessLevel,
        expiresAt: guestInvitations.expiresAt,
        acceptedAt: guestInvitations.acceptedAt,
        pageId: guestInvitations.pageId,
        pageTitle: pages.title,
        pageIcon: pages.icon,
      })
      .from(guestInvitations)
      .innerJoin(pages, eq(pages.id, guestInvitations.pageId))
      .where(eq(guestInvitations.token, token))
      .limit(1);

    if (!inv) {
      return apiError(404, "Invitation not found");
    }
    if (inv.expiresAt < new Date()) {
      return apiError(410, "Invitation has expired");
    }
    if (inv.acceptedAt) {
      return apiError(409, "Invitation already accepted");
    }

    return Response.json({
      invitation: {
        id: inv.id,
        email: inv.email,
        accessLevel: inv.accessLevel,
        expiresAt: inv.expiresAt,
        page: { id: inv.pageId, title: inv.pageTitle, icon: inv.pageIcon },
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

// POST /api/invite/guest/[token]/accept — accept invitation
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const session = await getSession();

    const [inv] = await db
      .select()
      .from(guestInvitations)
      .where(eq(guestInvitations.token, token))
      .limit(1);

    if (!inv) {
      return apiError(404, "Invitation not found");
    }
    if (inv.expiresAt < new Date()) {
      return apiError(410, "Invitation has expired");
    }
    if (inv.acceptedAt) {
      return apiError(409, "Invitation already accepted");
    }

    // Verify session email matches the invitation
    if (session.user.email?.toLowerCase() !== inv.email) {
      return apiError(
        403,
        "This invitation was sent to a different email address"
      );
    }

    const [page] = await db
      .select({ shortId: pages.shortId, workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, inv.pageId))
      .limit(1);

    const [ws] = page?.workspaceId
      ? await db
          .select({ slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.id, page.workspaceId))
          .limit(1)
      : [];

    await db.transaction(async (tx) => {
      // Mark accepted
      await tx
        .update(guestInvitations)
        .set({ acceptedAt: new Date() })
        .where(eq(guestInvitations.token, token));

      // Create page_permissions row
      await tx
        .insert(pagePermissions)
        .values({
          pageId: inv.pageId,
          userId: session.user.id,
          guestEmail: inv.email,
          accessLevel: inv.accessLevel,
          grantedBy: inv.invitedBy ?? session.user.id,
        })
        .onConflictDoUpdate({
          target: [pagePermissions.pageId, pagePermissions.userId],
          set: { accessLevel: inv.accessLevel, updatedAt: new Date() },
        });

      // Page-only guests never go through the onboarding wizard (doc/CLAUDE.md
      // "Guest bypass") — mark it done so /platform/post-auth never sends them
      // there if they land on a route that doesn't have a page-scoped guard.
      await tx
        .update(users)
        .set({ onboardingCompleted: true })
        .where(eq(users.id, session.user.id));

      // Notify the original inviter that their guest accepted
      if (inv.invitedBy && page?.workspaceId) {
        await triggerGuestAcceptedNotification(tx, {
          workspaceId: page.workspaceId,
          inviterId: inv.invitedBy,
          acceptorId: session.user.id,
          pageId: inv.pageId,
          invitationId: inv.id,
          acceptorName: session.user.name ?? session.user.email ?? inv.email,
        });
      }
    });

    return Response.json({
      ok: true,
      pageId: inv.pageId,
      shortId: page?.shortId,
      workspaceSlug: ws?.slug,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
