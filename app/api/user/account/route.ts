import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const deleteSchema = z.object({ email: z.string().email() });

// DELETE /api/user/account
// Blocked if the user is the sole Admin of any workspace — deleting them
// would leave that workspace with nobody able to manage members or billing.
export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Invalid input");
    }

    if (parsed.data.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return apiError(400, "Email does not match your account email");
    }

    // Find every workspace where the user is the sole active Admin
    const adminMemberships = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        name: workspaces.name,
        slug: workspaces.slug,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.role, "admin"),
          eq(workspaceMembers.status, "active")
        )
      );

    const blockingWorkspaces = [];

    for (const m of adminMemberships) {
      const otherActiveMembers = await db
        .select({ id: workspaceMembers.id, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, m.workspaceId),
            eq(workspaceMembers.status, "active"),
            ne(workspaceMembers.userId, session.user.id)
          )
        );

      const hasOtherAdmin = otherActiveMembers.some((o) => o.role === "admin");

      if (!hasOtherAdmin) {
        blockingWorkspaces.push({
          id: m.workspaceId,
          name: m.name,
          slug: m.slug,
          hasOtherMembers: otherActiveMembers.length > 0,
        });
      }
    }

    // Report every blocking workspace at once, not just the first one —
    // so the user can resolve them all in one pass instead of hitting this
    // error repeatedly.
    if (blockingWorkspaces.length > 0) {
      return Response.json(
        {
          error:
            "You're the only Admin in one or more workspaces. Promote another member or transfer ownership before deleting your account.",
          blockingWorkspaces,
        },
        { status: 409 }
      );
    }

    await db.delete(users).where(eq(users.id, session.user.id));

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
