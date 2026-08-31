import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blocks, pages, templateCategories, templates } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const saveSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid(),
  pageId: z.string().uuid(),
});

// GET /api/workspaces/:id/templates — list workspace custom templates
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id);

    const list = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.workspaceId, workspaceId),
          eq(templates.isBuiltIn, false)
        )
      )
      .orderBy(templates.createdAt);

    return Response.json(list);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// POST /api/workspaces/:id/templates — save a page as a custom template
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id, "editor");

    const body = await req.json();
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { name, description, categoryId, pageId } = parsed.data;

    const [cat] = await db
      .select({ id: templateCategories.id })
      .from(templateCategories)
      .where(eq(templateCategories.id, categoryId))
      .limit(1);
    if (!cat) {
      return apiError(400, "Unknown category");
    }

    // Verify the page belongs to this workspace
    const [page] = await db
      .select()
      .from(pages)
      .where(
        and(
          eq(pages.id, pageId),
          eq(pages.workspaceId, workspaceId),
          eq(pages.isDeleted, false)
        )
      )
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    // Fetch all blocks for this page, ordered
    const pageBlocks = await db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, pageId))
      .orderBy(blocks.orderIndex);

    // Build nested block snapshot
    type SnapBlock = {
      id: string;
      type: string;
      content: unknown;
      schema_version: number;
      order_index: number;
      parent_block_id: string | null;
      children: SnapBlock[];
    };

    function buildTree(parentId: string | null): SnapBlock[] {
      return pageBlocks
        .filter((b) => b.parentBlockId === parentId)
        .map((b) => ({
          id: b.id,
          type: b.type,
          content: b.content,
          schema_version: b.schemaVersion,
          order_index: b.orderIndex,
          parent_block_id: b.parentBlockId,
          children: buildTree(b.id),
        }));
    }

    const blockTree = buildTree(null);

    // Fetch direct child pages as subpage placeholders
    const childPages = await db
      .select({ title: pages.title })
      .from(pages)
      .where(
        and(
          eq(pages.parentId, pageId),
          eq(pages.isDeleted, false),
          isNull(pages.databaseId)
        )
      )
      .orderBy(pages.orderIndex);

    const snapshot = {
      title: page.title,
      icon: page.icon,
      cover_url: page.coverUrl,
      is_full_width: page.isFullWidth,
      font_family: "default",
      blocks: blockTree,
      subpages: childPages.map((p) => ({ title: p.title ?? "Untitled" })),
      database_schema: null,
    };

    // Enforce max 5 custom templates with FOR UPDATE to prevent race condition
    const [template] = await db.transaction(async (tx) => {
      const [{ cnt }] = await tx
        .select({ cnt: count() })
        .from(templates)
        .where(
          and(
            eq(templates.workspaceId, workspaceId),
            eq(templates.isBuiltIn, false)
          )
        );

      if (Number(cnt) >= 5) {
        throw new ApiError(
          400,
          "Template limit reached. A workspace can have at most 5 custom templates."
        );
      }

      return tx
        .insert(templates)
        .values({
          workspaceId,
          name,
          description: description ?? null,
          categoryId,
          isBuiltIn: false,
          status: "published",
          createdBy: session.user.id,
          pageSnapshot: snapshot,
        })
        .returning();
    });

    return Response.json(template, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
