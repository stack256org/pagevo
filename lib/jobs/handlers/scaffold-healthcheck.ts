import { and, eq, isNull } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { templateCategories, templates } from "@/lib/db/schema";

export async function handleScaffoldHealthcheck(
  jobs: Job<Record<string, never>>[]
) {
  for (const job of jobs) {
    console.log(`[worker] scaffold healthcheck ok (${job.id})`);
  }

  await autoSeedTemplates();
}

// Exported so it can also be called synchronously right after the very
// first admin is created (lib/auth/index.ts), instead of a fresh self-hosted
// instance waiting on this job's ~10-minute cron tick for its first template.
export async function autoSeedTemplates() {
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
    console.log(`[scaffold] auto-seeded ${rows.length} built-in templates`);
  } catch (err) {
    console.error("[scaffold] template auto-seed failed:", err);
  }
}
