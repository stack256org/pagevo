import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/notifications/:id — dismiss a single notification. Notifications
// have no soft-delete column (unlike comments), so this is a hard delete,
// matching clear-all/route.ts's existing behavior — just scoped to one row.
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientId, session.user.id)
        )
      );

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    console.error("[DELETE /api/notifications/:id]", e);
    return apiError(500, "Internal error");
  }
}
