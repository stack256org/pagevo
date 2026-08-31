import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
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
    console.error("[PATCH /api/notifications/:id/read]", e);
    return apiError(500, "Internal error");
  }
}
