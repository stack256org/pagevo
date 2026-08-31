import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { templateCategories, templates } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

// GET /api/templates — list all published built-in templates (authenticated)
export async function GET() {
  try {
    await getSession();

    // Lazy-seed built-in templates the first time any user opens the gallery
    await ensureBuiltInTemplates();

    const list = await db
      .select({
        id: templates.id,
        workspaceId: templates.workspaceId,
        name: templates.name,
        description: templates.description,
        categoryId: templates.categoryId,
        isBuiltIn: templates.isBuiltIn,
        status: templates.status,
        createdBy: templates.createdBy,
        pageSnapshot: templates.pageSnapshot,
        createdAt: templates.createdAt,
        updatedAt: templates.updatedAt,
      })
      .from(templates)
      .innerJoin(
        templateCategories,
        eq(templates.categoryId, templateCategories.id)
      )
      .where(
        and(
          eq(templates.isBuiltIn, true),
          eq(templates.status, "published"),
          isNull(templates.workspaceId)
        )
      )
      .orderBy(templateCategories.orderIndex, templates.name);

    return Response.json(list);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

async function ensureBuiltInTemplates() {
  try {
    const existing = await db
      .select({ name: templates.name })
      .from(templates)
      .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)));
    const existingNames = new Set(existing.map((t) => t.name));

    const { BUILT_IN_TEMPLATES, DEFAULT_TEMPLATE_CATEGORIES } = await import(
      "@/lib/orbit/templates/built-in"
    );
    const missing = BUILT_IN_TEMPLATES.filter(
      (t) => !existingNames.has(t.name)
    );
    if (missing.length === 0) {
      return;
    }

    await db
      .insert(templateCategories)
      .values(DEFAULT_TEMPLATE_CATEGORIES)
      .onConflictDoNothing();

    const categories = await db
      .select({ id: templateCategories.id, key: templateCategories.key })
      .from(templateCategories);
    const categoryIdByKey = new Map(categories.map((c) => [c.key, c.id]));

    const rows = missing.flatMap((t) => {
      const categoryId = categoryIdByKey.get(t.category);
      if (!categoryId) {
        return [];
      }
      return [
        {
          name: t.name,
          description: t.description,
          categoryId,
          isBuiltIn: true,
          status: "published" as const,
          workspaceId: null,
          createdBy: null,
          pageSnapshot: t.pageSnapshot,
        },
      ];
    });
    if (rows.length === 0) {
      return;
    }

    await db.insert(templates).values(rows);
  } catch {
    // Non-fatal: return whatever templates exist
  }
}
