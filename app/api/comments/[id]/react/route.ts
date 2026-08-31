import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { comments, pages } from "@/lib/db/schema";
import { resolveDisplayName } from "@/lib/users/display-name";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ emoji: z.string().min(1).max(8) });

// POST /api/comments/:id/react — toggle an emoji reaction for the current user
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    const userId = session.user.id;

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Invalid emoji");
    }

    const { emoji } = parsed.data;

    // Load comment + workspace for auth
    const rows = await db
      .select({
        id: comments.id,
        reactions: comments.reactions,
        workspaceId: pages.workspaceId,
      })
      .from(comments)
      .innerJoin(pages, eq(pages.id, comments.pageId))
      .where(eq(comments.id, id))
      .limit(1);

    const comment = rows[0];
    if (!comment) {
      return apiError(404, "Comment not found");
    }

    // One reaction per user: strip this user from every emoji, then add them
    // to the requested one (unless they already had it — that's a toggle-off).
    const current: Record<string, string[]> =
      (comment.reactions as Record<string, string[]>) ?? {};
    const hadThisEmoji = (current[emoji] ?? []).includes(userId);

    const updated: Record<string, string[]> = {};
    for (const [e, users] of Object.entries(current)) {
      const filtered = (users as string[]).filter((u) => u !== userId);
      if (filtered.length > 0) {
        updated[e] = filtered;
      }
    }
    if (!hadThisEmoji) {
      updated[emoji] = [...(updated[emoji] ?? []), userId];
    }

    const [saved] = await db
      .update(comments)
      .set({ reactions: updated })
      .where(eq(comments.id, id))
      .returning({ reactions: comments.reactions });

    // Include the reactor's own resolved name so the client can update its
    // local reactionUsers map immediately — without this, a user's *first*
    // reaction on a page shows "Former Member" (their id isn't in the map
    // yet) until something else triggers a full comments refetch.
    return Response.json({
      reactions: saved?.reactions ?? {},
      reactorId: userId,
      reactorName: resolveDisplayName(session.user.name, session.user.email),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[POST /api/comments/:id/react]", err);
    return apiError(500, "Internal server error");
  }
}
