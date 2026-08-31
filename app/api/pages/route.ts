import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blocks, pages } from "@/lib/db/schema";
import { triggerPageCreatedNotification } from "@/lib/notifications/triggers";
import { insertPageWithClosure } from "@/lib/pages/closure";
import { isMeaningfulTitle } from "@/lib/pages/draft";
import { upsertPageSearchIndex } from "@/lib/search/index-page";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const createPageSchema = z.object({
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
  title: z.string().max(500).default("Untitled"),
  kind: z.enum(["page", "database", "entry"]).default("page"),
  databaseId: z.string().uuid().nullable().optional(),
  icon: z.string().nullable().optional(),
  isPrivate: z.boolean().optional().default(false),
});

// POST /api/pages
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const parsed = createPageSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, parentId, title, kind, databaseId, icon, isPrivate } =
      parsed.data;

    await requireWorkspaceMember(workspaceId, session.user.id, "editor");

    // If parentId given, verify it belongs to this workspace
    if (parentId) {
      const [parent] = await db
        .select({ id: pages.id })
        .from(pages)
        .where(and(eq(pages.id, parentId), eq(pages.workspaceId, workspaceId)))
        .limit(1);
      if (!parent) {
        return apiError(404, "Parent page not found");
      }
    }

    // Get next orderIndex among siblings
    const [{ maxOrder }] = await db
      .select({ maxOrder: max(pages.orderIndex) })
      .from(pages)
      .where(
        and(
          eq(pages.workspaceId, workspaceId),
          eq(pages.isDeleted, false),
          parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId)
        )
      );

    const orderIndex = (maxOrder ?? -1) + 1;
    const shortId = createId().slice(0, 10);

    // A blank "New Page" starts as a silent draft, invisible until it has real content; a meaningful title at creation skips draft state entirely.
    const startsAsDraft = kind === "page" && !isMeaningfulTitle(title);

    const newPage = await db.transaction(async (tx) => {
      const [page] = await tx
        .insert(pages)
        .values({
          shortId,
          workspaceId,
          parentId,
          kind,
          databaseId: databaseId ?? null,
          title: title || "Untitled",
          icon: icon ?? null,
          isPrivate,
          isDraft: startsAsDraft,
          orderIndex,
          createdBy: session.user.id,
          lastEditedBy: session.user.id,
        })
        .returning();

      await insertPageWithClosure(tx, page.id, parentId);

      // Every new page starts with one empty paragraph block
      if (kind === "page" || kind === "entry") {
        await tx.insert(blocks).values({
          pageId: page.id,
          parentBlockId: null,
          type: "paragraph",
          content: { text: [], schemaVersion: 1 },
          schemaVersion: 1,
          orderIndex: 0,
          createdBy: session.user.id,
        });
      }

      await upsertPageSearchIndex(tx, {
        id: page.id,
        workspaceId: page.workspaceId,
        title: page.title,
        kind: page.kind,
      });

      await triggerPageCreatedNotification(tx, {
        workspaceId: page.workspaceId,
        pageId: page.id,
        creatorId: session.user.id,
        pageTitle: page.title || "Untitled",
        isPrivate: page.isPrivate,
        kind: page.kind,
        isDraft: page.isDraft,
      });

      return page;
    });

    return Response.json(newPage, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
