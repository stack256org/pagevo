import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userFavorites } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// PATCH /api/user/favorites/reorder
// Body: { ids: string[] } — ordered list of favorite pageIds
export async function PATCH(req: Request) {
  try {
    const session = await getSession();

    const body = await req.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { ids } = parsed.data;

    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(userFavorites)
          .set({ orderIndex: i })
          .where(
            and(
              eq(userFavorites.userId, session.user.id),
              eq(userFavorites.pageId, ids[i] as string)
            )
          );
      }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
