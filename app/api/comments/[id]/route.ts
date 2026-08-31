import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { extractMentionedUserIds } from "@/lib/comments/mentions";
import { db } from "@/lib/db";
import { comments, notifications, pages } from "@/lib/db/schema";
import { triggerMentionNotifications } from "@/lib/notifications/triggers";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

async function loadCommentWithPage(commentId: string) {
  const rows = await db
    .select({
      id: comments.id,
      pageId: comments.pageId,
      parentId: comments.parentId,
      authorId: comments.authorId,
      content: comments.content,
      deletedAt: comments.deletedAt,
      workspaceId: pages.workspaceId,
    })
    .from(comments)
    .innerJoin(pages, eq(pages.id, comments.pageId))
    .where(eq(comments.id, commentId))
    .limit(1);

  return rows[0] ?? null;
}

const patchSchema = z
  .object({
    content: z.record(z.string(), z.unknown()),
  })
  .strict();

// PATCH /api/comments/:id — edit a comment (author only)
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const comment = await loadCommentWithPage(id);
    if (!comment) {
      return apiError(404, "Comment not found");
    }

    if (comment.authorId !== session.user.id) {
      return apiError(403, "Only the author can edit this comment");
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { content } = parsed.data;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(comments)
        .set({ content, editedAt: new Date() })
        .where(eq(comments.id, id))
        .returning();

      // Mention diff: find newly mentioned users vs already notified
      const newMentions = extractMentionedUserIds(content);
      const oldMentions = extractMentionedUserIds(
        comment.content as Record<string, unknown>
      );
      const alreadyNotifiedRows = await tx
        .select({ sourceId: notifications.sourceId })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "mention"),
            inArray(notifications.sourceId, [id]) // source_id = commentId
          )
        );

      const alreadyNotified = new Set([
        ...oldMentions,
        ...(alreadyNotifiedRows
          .map((r) => r.sourceId)
          .filter(Boolean) as string[]),
      ]);

      const freshMentions = newMentions.filter(
        (uid) => !alreadyNotified.has(uid)
      );

      if (freshMentions.length > 0) {
        await triggerMentionNotifications(tx, {
          commentId: id,
          pageId: comment.pageId,
          workspaceId: comment.workspaceId,
          authorId: session.user.id,
          content,
          skipUserIds: [...alreadyNotified],
        });
      }

      return row;
    });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[PATCH /api/comments/:id]", err);
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/comments/:id — delete a comment (author or workspace admin)
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const comment = await loadCommentWithPage(id);
    if (!comment) {
      return apiError(404, "Comment not found");
    }

    // Check: author OR workspace admin
    const isAuthor = comment.authorId === session.user.id;
    if (!isAuthor) {
      const member = await requireWorkspaceMember(
        comment.workspaceId,
        session.user.id,
        "admin"
      );
      if (!member) {
        return apiError(403, "Forbidden");
      }
    }

    await db.transaction(async (tx) => {
      const isRoot = !comment.parentId;

      if (isRoot) {
        // Check if this root has any replies
        const [replyRow] = await tx
          .select({ id: comments.id })
          .from(comments)
          .where(eq(comments.parentId, id))
          .limit(1);

        if (replyRow) {
          // Has replies — soft delete (show "[Comment deleted]" placeholder)
          await tx
            .update(comments)
            .set({ deletedAt: new Date() })
            .where(eq(comments.id, id));
        } else {
          // No replies — hard delete
          await tx.delete(comments).where(eq(comments.id, id));
        }
      } else {
        // Reply — always hard delete
        await tx.delete(comments).where(eq(comments.id, id));
      }
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[DELETE /api/comments/:id]", err);
    return apiError(500, "Internal server error");
  }
}
