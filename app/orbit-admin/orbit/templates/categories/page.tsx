import { asc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { CategoriesManager } from "@/components/orbit/categories-manager";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { templateCategories, templates } from "@/lib/db/schema";

export const metadata = { title: "Categories – Orbit Admin" };

export default async function TemplateCategoriesPage() {
  await requireAdmin();

  // Same shape as GET /api/orbit/templates/categories (left-join + count so
  // the UI can disable deletion up front for in-use categories).
  const categories = await db
    .select({
      id: templateCategories.id,
      key: templateCategories.key,
      label: templateCategories.label,
      icon: templateCategories.icon,
      orderIndex: templateCategories.orderIndex,
      templateCount: count(templates.id),
    })
    .from(templateCategories)
    .leftJoin(templates, eq(templates.categoryId, templateCategories.id))
    .groupBy(templateCategories.id)
    .orderBy(asc(templateCategories.orderIndex));

  const withCounts = categories.map((c) => ({
    ...c,
    templateCount: Number(c.templateCount),
  }));

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-base-content/70">
        <Link
          className="flex items-center gap-1 transition-colors hover:text-base-content"
          href="/orbit-admin/orbit/templates"
        >
          <svg
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 12 12"
          >
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          Templates
        </Link>
        <span className="text-base-300">/</span>
        <span className="font-medium text-base-content">Categories</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-base-content">
          Categories
        </h1>
        <p className="mt-1 text-sm text-base-content/70">
          Add, rename, or remove the categories templates are grouped under.
        </p>
      </div>

      <CategoriesManager initialCategories={withCounts} />
    </div>
  );
}
