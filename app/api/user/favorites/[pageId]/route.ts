import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userFavorites } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ pageId: string }> };

// DELETE /api/user/favorites/:pageId
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { pageId } = await params;
    const session = await getSession();

    await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, session.user.id),
          eq(userFavorites.pageId, pageId)
        )
      );

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
