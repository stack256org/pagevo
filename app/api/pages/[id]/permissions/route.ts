import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  pagePermissions,
  pages,
  users,
  workspaceMembers,
} from "@/lib/db/schema";
import { triggerAccessGrantedNotification } from "@/lib/notifications/triggers";
import type { AccessLevel } from "@/lib/permissions/resolver";
import {
  capAccessToRole,
  requirePagePermission,
} from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pages/[id]/permissions — list all grants for this page
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    const grants = await db
      .select({
        id: pagePermissions.id,
        userId: pagePermissions.userId,
        guestEmail: pagePermissions.guestEmail,
        accessLevel: pagePermissions.accessLevel,
        createdAt: pagePermissions.createdAt,
        userName: users.name,
        userImage: users.image,
        userEmail: users.email,
      })
      .from(pagePermissions)
      .leftJoin(users, eq(users.id, pagePermissions.userId))
      .where(eq(pagePermissions.pageId, pageId));

    return Response.json({ permissions: grants });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

const grantSchema = z.object({
  userId: z.string().uuid().optional(),
  accessLevel: z.enum(["full_access", "can_edit", "can_comment", "can_view"]),
});

// POST /api/pages/[id]/permissions — add or update a member's access
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    const body = await req.json();
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0].message);
    }

    const { userId, accessLevel: requested } = parsed.data;
    if (!userId) {
      return apiError(400, "userId is required");
    }

    // Cap to target user's workspace role (Rule 1 — ceiling enforcement)
    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, page.workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);
    if (!member) {
      return apiError(404, "User is not a workspace member");
    }

    const actual = capAccessToRole(requested as AccessLevel, member.role);

    await db.transaction(async (tx) => {
      const [perm] = await tx
        .insert(pagePermissions)
        .values({
          pageId,
          userId,
          accessLevel: actual,
          grantedBy: session.user.id,
        })
        .onConflictDoUpdate({
          target: [pagePermissions.pageId, pagePermissions.userId],
          set: { accessLevel: actual, updatedAt: new Date() },
        })
        .returning({ id: pagePermissions.id });

      if (perm) {
        await triggerAccessGrantedNotification(tx, {
          pageId,
          workspaceId: page.workspaceId,
          granterId: session.user.id,
          recipientId: userId,
          permissionId: perm.id,
        });
      }
    });

    return Response.json({ ok: true, accessLevel: actual });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/pages/[id]/permissions?userId=xxx — remove a member's explicit grant
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return apiError(400, "userId query param required");
    }

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    await db
      .delete(pagePermissions)
      .where(
        and(
          eq(pagePermissions.pageId, pageId),
          eq(pagePermissions.userId, userId)
        )
      );

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
