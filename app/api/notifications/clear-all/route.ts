import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { notificationScope } from "@/lib/notifications/scope";
import { apiError, getSession } from "@/lib/workspaces/auth";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const { workspaceId } = await req.json();

    if (!workspaceId) {
      return apiError(400, "workspaceId required");
    }

    await db
      .delete(notifications)
      .where(notificationScope(session.user.id, workspaceId));

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    console.error("[POST /api/notifications/clear-all]", e);
    return apiError(500, "Internal error");
  }
}
