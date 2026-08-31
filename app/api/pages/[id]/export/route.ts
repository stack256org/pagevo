import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { blocks, pages } from "@/lib/db/schema";
import {
  type BlockRow,
  renderHtml,
  renderMarkdown,
} from "@/lib/jobs/handlers/export-page";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const exportSchema = z.object({
  format: z.enum(["markdown", "html"]),
});

function slugify(title: string): string {
  return (
    (title || "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select({
        id: pages.id,
        workspaceId: pages.workspaceId,
        title: pages.title,
        isDeleted: pages.isDeleted,
      })
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);

    if (!page) {
      return apiError(404, "Page not found");
    }
    if (page.isDeleted) {
      return apiError(400, "Page is in Trash");
    }

    await requireWorkspaceMember(page.workspaceId, session.user.id);

    const body = await req.json();
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "Invalid format");
    }

    const { format } = parsed.data;

    const allBlocks = await db
      .select({
        type: blocks.type,
        content: blocks.content,
        orderIndex: blocks.orderIndex,
      })
      .from(blocks)
      .where(eq(blocks.pageId, page.id))
      .orderBy(blocks.orderIndex);

    const rows: BlockRow[] = allBlocks.map((b) => ({
      type: b.type,
      content: (b.content ?? {}) as Record<string, unknown>,
      orderIndex: b.orderIndex,
    }));

    const filename = slugify(page.title);

    if (format === "markdown") {
      const content = renderMarkdown(page.title, rows);
      return new Response(content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.md"`,
        },
      });
    }

    // html
    const content = renderHtml(page.title, rows);
    return new Response(content, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.html"`,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
