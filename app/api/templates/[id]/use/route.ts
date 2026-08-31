import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { pages, templates } from "@/lib/db/schema";
import {
  createDatabaseFromSnapshot,
  createPageFromSnapshot,
  type DatabaseSchema,
  type PageSnapshot,
} from "@/lib/templates/instantiate";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const useSchema = z.object({
  workspaceId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
});

// POST /api/templates/:id/use — create a new page (or database) from a template
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    const body = await req.json();
    const parsed = useSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, parentId } = parsed.data;

    await requireWorkspaceMember(workspaceId, session.user.id, "editor");

    const [tpl] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.status, "published")))
      .limit(1);

    if (!tpl) {
      return apiError(404, "Template not found");
    }
    if (!tpl.isBuiltIn && tpl.workspaceId !== workspaceId) {
      return apiError(403, "Forbidden");
    }

    const snapshot = tpl.pageSnapshot as PageSnapshot;

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

    const newPage = await db.transaction(async (tx) => {
      if (snapshot.database_schema) {
        return createDatabaseFromSnapshot(tx, {
          snapshot: snapshot as PageSnapshot & {
            database_schema: DatabaseSchema;
          },
          fallbackTitle: tpl.name,
          workspaceId,
          parentId,
          orderIndex,
          userId: session.user.id,
        });
      }

      return createPageFromSnapshot(tx, {
        snapshot,
        fallbackTitle: tpl.name,
        workspaceId,
        parentId,
        orderIndex,
        userId: session.user.id,
      });
    });

    return Response.json(
      { shortId: newPage.shortId, id: newPage.id, kind: newPage.kind },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[POST /api/templates/:id/use]", err);
    return apiError(500, "Internal server error");
  }
}
