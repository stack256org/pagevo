import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { comments, pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    content: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("react"),
    emoji: z.string().min(1).max(8),
  }),
  z.object({
    action: z.literal("resolve"),
    isResolved: z.boolean(),
  }),
]);

// PATCH /api/pages/:id/comments/:commentId — edit content, toggle reaction, or resolve
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id: pageId, commentId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }
    await requireWorkspaceMember(page.workspaceId, session.user.id);

    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.pageId, pageId)))
      .limit(1);
    if (!comment) {
      return apiError(404, "Comment not found");
    }
    if (comment.deletedAt) {
      return apiError(410, "Comment deleted");
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    if (parsed.data.action === "edit") {
      if (comment.authorId !== session.user.id) {
        return apiError(403, "Not your comment");
      }
      const [updated] = await db
        .update(comments)
        .set({ content: parsed.data.content, editedAt: new Date() })
        .where(eq(comments.id, commentId))
        .returning();
      return Response.json(updated);
    }

    if (parsed.data.action === "react") {
      const { emoji } = parsed.data;
      const userId = session.user.id;
      const reactions = (comment.reactions as Record<string, string[]>) ?? {};

      // Check if user already reacted with THIS emoji (toggling off)
      const alreadyReacted = (reactions[emoji] ?? []).includes(userId);

      // Remove user from ALL emoji arrays (exclusive: one reaction per user)
      const cleaned: Record<string, string[]> = {};
      for (const [e, ids] of Object.entries(reactions)) {
        const filtered = ids.filter((id) => id !== userId);
        if (filtered.length > 0) {
          cleaned[e] = filtered;
        }
      }

      // If not already reacted with this emoji, add the new reaction
      const updated = alreadyReacted
        ? cleaned
        : { ...cleaned, [emoji]: [...(cleaned[emoji] ?? []), userId] };

      const [row] = await db
        .update(comments)
        .set({ reactions: updated })
        .where(eq(comments.id, commentId))
        .returning();
      return Response.json(row);
    }

    if (parsed.data.action === "resolve") {
      const [updated] = await db
        .update(comments)
        .set({ isResolved: parsed.data.isResolved })
        .where(eq(comments.id, commentId))
        .returning();
      return Response.json(updated);
    }

    return apiError(400, "Unknown action");
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[PATCH /api/pages/:id/comments/:commentId]", err);
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/pages/:id/comments/:commentId — soft delete
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id: pageId, commentId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }
    await requireWorkspaceMember(page.workspaceId, session.user.id);

    const [comment] = await db
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.pageId, pageId)))
      .limit(1);
    if (!comment) {
      return apiError(404, "Comment not found");
    }
    if (comment.authorId !== session.user.id) {
      return apiError(403, "Not your comment");
    }

    await db
      .update(comments)
      .set({ deletedAt: new Date() })
      .where(eq(comments.id, commentId));

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[DELETE /api/pages/:id/comments/:commentId]", err);
    return apiError(500, "Internal server error");
  }
}
