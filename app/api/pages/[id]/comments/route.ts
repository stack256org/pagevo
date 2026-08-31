import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { comments, pages, users } from "@/lib/db/schema";
import {
  triggerCommentNotifications,
  triggerMentionNotifications,
} from "@/lib/notifications/triggers";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { resolveDisplayName } from "@/lib/users/display-name";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pages/:id/comments — list all threads + replies
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

    await requirePagePermission(session.user.id, pageId, "can_view");

    const allComments = await db
      .select({
        id: comments.id,
        blockId: comments.blockId,
        parentId: comments.parentId,
        threadNumber: comments.threadNumber,
        anchorStart: comments.anchorStart,
        anchorEnd: comments.anchorEnd,
        isResolved: comments.isResolved,
        isOrphaned: comments.isOrphaned,
        content: comments.content,
        reactions: comments.reactions,
        propertyId: comments.propertyId,
        propertyName: comments.propertyName,
        propertyValueLabel: comments.propertyValueLabel,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        deletedAt: comments.deletedAt,
        authorId: comments.authorId,
        authorName: users.name,
        authorEmail: users.email,
        authorImage: users.image,
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(eq(comments.pageId, pageId))
      .orderBy(asc(comments.threadNumber), asc(comments.createdAt));

    // Group into roots + replies
    const rootMap = new Map<
      string,
      (typeof allComments)[0] & { replies: typeof allComments }
    >();
    const replyList: typeof allComments = [];

    for (const c of allComments) {
      if (c.parentId) {
        replyList.push(c);
      } else {
        rootMap.set(c.id, { ...c, replies: [] });
      }
    }

    for (const reply of replyList) {
      const parent = rootMap.get(reply.parentId!);
      if (parent) {
        parent.replies.push(reply);
      }
    }

    const shaped = Array.from(rootMap.values()).map((r) => ({
      id: r.id,
      blockId: r.blockId,
      parentId: r.parentId,
      threadNumber: r.threadNumber,
      anchorStart: r.anchorStart,
      anchorEnd: r.anchorEnd,
      isResolved: r.isResolved,
      isOrphaned: r.isOrphaned,
      content: r.deletedAt ? null : r.content,
      reactions: (r.reactions as Record<string, string[]>) ?? {},
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      propertyValueLabel: r.propertyValueLabel,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
      deletedAt: r.deletedAt,
      author: r.authorId
        ? {
            id: r.authorId,
            name: resolveDisplayName(r.authorName, r.authorEmail),
            email: r.authorEmail,
            image: r.authorImage,
          }
        : null,
      replies: r.replies.map((rep) => ({
        id: rep.id,
        blockId: rep.blockId,
        parentId: rep.parentId,
        isResolved: rep.isResolved,
        isOrphaned: rep.isOrphaned,
        content: rep.deletedAt ? null : rep.content,
        reactions: (rep.reactions as Record<string, string[]>) ?? {},
        createdAt: rep.createdAt,
        editedAt: rep.editedAt,
        deletedAt: rep.deletedAt,
        author: rep.authorId
          ? {
              id: rep.authorId,
              name: resolveDisplayName(rep.authorName, rep.authorEmail),
              email: rep.authorEmail,
              image: rep.authorImage,
            }
          : null,
      })),
    }));

    const unresolvedCount = shaped.filter(
      (r) => !r.isResolved && !r.deletedAt
    ).length;

    // Reactions only store reactor user IDs (see comments.reactions) — resolve
    // them to names in one batch query so the client can show "X reacted with
    // 😀" on hover instead of just a count, without an N+1 lookup per emoji.
    const reactorIds = new Set<string>();
    for (const c of allComments) {
      const reactions = (c.reactions as Record<string, string[]>) ?? {};
      for (const ids of Object.values(reactions)) {
        for (const id of ids) {
          reactorIds.add(id);
        }
      }
    }
    const reactorRows = reactorIds.size
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, [...reactorIds]))
      : [];
    // Absent from this map (rather than present with a null/empty value)
    // means the id no longer belongs to any user — that's the only case
    // formatReactorNames should show "Former Member" for.
    const reactionUsers = Object.fromEntries(
      reactorRows.map((u) => [u.id, resolveDisplayName(u.name, u.email)])
    );

    return Response.json({
      comments: shaped,
      totalCount: shaped.length,
      unresolvedCount,
      reactionUsers,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[GET /api/pages/:id/comments]", err);
    return apiError(500, "Internal server error");
  }
}

const createCommentSchema = z.object({
  blockId: z.string().uuid().nullable().default(null),
  parentId: z.string().uuid().nullable().default(null),
  anchorStart: z.number().int().min(0).nullable().default(null),
  anchorEnd: z.number().int().min(0).nullable().default(null),
  propertyId: z.string().uuid().nullable().default(null),
  propertyName: z.string().nullable().default(null),
  propertyValueLabel: z.string().nullable().default(null),
  content: z.record(z.string(), z.unknown()),
});

// POST /api/pages/:id/comments — create comment or reply
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

    await requirePagePermission(session.user.id, pageId, "can_comment");

    const body = await req.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const {
      blockId,
      parentId,
      anchorStart,
      anchorEnd,
      propertyId,
      propertyName,
      propertyValueLabel,
      content,
    } = parsed.data;

    // Validate reply depth — parent must be a root
    if (parentId) {
      const [parent] = await db
        .select({ id: comments.id, parentId: comments.parentId })
        .from(comments)
        .where(eq(comments.id, parentId))
        .limit(1);

      if (!parent) {
        return apiError(404, "Parent comment not found");
      }
      if (parent.parentId !== null) {
        return apiError(400, "Cannot reply to a reply");
      }
    }

    const newComment = await db.transaction(async (tx) => {
      // Assign thread_number only for roots
      let threadNumber: number | null = null;
      if (!parentId) {
        const rows = await tx
          .select({ threadNumber: comments.threadNumber })
          .from(comments)
          .where(and(eq(comments.pageId, pageId), isNull(comments.parentId)))
          .orderBy(desc(comments.threadNumber))
          .limit(1);

        const maxNum = rows[0]?.threadNumber ?? 0;
        threadNumber = maxNum + 1;
      }

      const [inserted] = await tx
        .insert(comments)
        .values({
          pageId,
          blockId: blockId ?? null,
          parentId: parentId ?? null,
          anchorStart: anchorStart ?? null,
          anchorEnd: anchorEnd ?? null,
          propertyId: propertyId ?? null,
          propertyName: propertyName ?? null,
          propertyValueLabel: propertyValueLabel ?? null,
          threadNumber,
          content,
          authorId: session.user.id,
        })
        .returning();

      await triggerCommentNotifications(tx, {
        commentId: inserted.id,
        pageId,
        workspaceId: page.workspaceId,
        authorId: session.user.id,
        parentId,
        content,
      });

      await triggerMentionNotifications(tx, {
        commentId: inserted.id,
        pageId,
        workspaceId: page.workspaceId,
        authorId: session.user.id,
        content,
      });

      return inserted;
    });

    return Response.json(newComment, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[POST /api/pages/:id/comments]", err);
    return apiError(500, "Internal server error");
  }
}
