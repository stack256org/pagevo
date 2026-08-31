import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { BackToTopButton } from "@/components/orbit/back-to-top-button";
import { SeedTemplatesButton } from "@/components/orbit/seed-templates-button";
import { TemplateArchiveButton } from "@/components/orbit/template-archive-button";
import { TemplateDeleteButton } from "@/components/orbit/template-delete-button";
import { TemplateDuplicateButton } from "@/components/orbit/template-duplicate-button";
import { TemplatePreviewButton } from "@/components/orbit/template-preview-modal";
import { TemplatePublishToggle } from "@/components/orbit/template-publish-toggle";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { templateCategories, templates } from "@/lib/db/schema";

export const metadata = { title: "Templates – Orbit Admin" };

// Cycled by category order — categories are admin-managed so we can't
// hardcode a color per key anymore.
const CATEGORY_CLS_CYCLE = [
  "bg-primary/10 text-primary",
  "bg-secondary text-secondary-content",
  "bg-error/10 text-error",
  "bg-success/10 text-success",
  "bg-warning/10 text-warning",
];

export default async function OrbitTemplatesPage() {
  await requireAdmin();

  const [list, categories] = await Promise.all([
    db
      .select()
      .from(templates)
      .where(and(eq(templates.isBuiltIn, true), isNull(templates.workspaceId)))
      .orderBy(desc(templates.updatedAt)),
    db
      .select()
      .from(templateCategories)
      .orderBy(asc(templateCategories.orderIndex)),
  ]);

  const categoryById = new Map(
    categories.map((c, i) => [
      c.id,
      {
        label: c.label,
        cls: CATEGORY_CLS_CYCLE[i % CATEGORY_CLS_CYCLE.length],
      },
    ])
  );

  const published = list.filter((t) => t.status === "published").length;
  const drafts = list.filter((t) => t.status === "draft").length;
  const archived = list.filter((t) => t.status === "archived").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content">
            Templates
          </h1>
          <p className="mt-1 text-sm text-base-content/70">
            Author and publish built-in templates for the user-facing gallery.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
              <strong className="font-bold text-base-content">
                {list.length}
              </strong>{" "}
              total
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <strong className="font-bold">{published}</strong> published
            </span>
            {drafts > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
                <strong className="font-bold text-base-content">
                  {drafts}
                </strong>{" "}
                drafts
              </span>
            )}
            {archived > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-sm bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <strong className="font-bold">{archived}</strong> archived
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <SeedTemplatesButton currentCount={list.length} />
        <div className="flex items-center gap-2">
          <Link
            className="flex items-center gap-2 rounded-md border border-base-300 bg-base-200 px-4 py-2 text-xs font-semibold text-base-content transition-colors duration-150 hover:bg-base-200"
            href="/orbit-admin/orbit/templates/categories"
          >
            <svg
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 14 14"
            >
              <path d="M2 3.5h4l1.5 2H12v5a1 1 0 01-1 1H2a1 1 0 01-1-1v-6a1 1 0 011-1z" />
            </svg>
            Categories
          </Link>
          <Link
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
            href="/orbit-admin/orbit/templates/new"
          >
            <svg
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 12 12"
            >
              <path d="M6 1v10M1 6h10" />
            </svg>
            New template
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="border-b border-base-300 bg-base-200/20 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-base-content">
            Built-in templates
          </h2>
          <p className="text-xs text-base-content/70">
            Only published templates appear in the user gallery
          </p>
        </div>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-md bg-base-200">
              <svg
                className="size-7 text-base-content/50"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.5"
                viewBox="0 0 20 20"
              >
                <rect height="16" rx="2" width="16" x="2" y="2" />
                <path d="M2 7h16M7 7v11" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-base-content/70">
              No templates yet
            </p>
            <p className="mt-1 text-xs text-base-content/70">
              Click <strong className="text-primary">+ New template</strong> or
              seed defaults above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-base-100">
                <tr className="bg-base-200/40">
                  {["Template", "Category", "Status", "Updated", "Actions"].map(
                    (h) => (
                      <th
                        className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-base-content/70"
                        key={h}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {list.map((tpl) => {
                  const cat = categoryById.get(tpl.categoryId);
                  const isPublished = tpl.status === "published";
                  const isArchived = tpl.status === "archived";
                  return (
                    <tr
                      className="group transition-colors hover:bg-base-200"
                      key={tpl.id}
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-base-content">
                          {tpl.name}
                        </p>
                        {tpl.description && (
                          <p className="mt-0.5 max-w-sm truncate text-xs text-base-content/70">
                            {tpl.description}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${cat?.cls ?? "bg-base-200 text-base-content/70"}`}
                        >
                          {cat?.label ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isPublished
                              ? "bg-success/10 text-success"
                              : isArchived
                                ? "bg-warning/10 text-warning"
                                : "bg-base-200 text-base-content/70"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${isPublished ? "bg-success" : isArchived ? "bg-warning" : "bg-base-content/40"}`}
                          />
                          {tpl.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-base-content/70">
                        {tpl.updatedAt
                          ? new Date(tpl.updatedAt).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="w-px whitespace-nowrap px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          <TemplatePreviewButton templateId={tpl.id} />
                          <IconTooltipButton
                            href={`/orbit-admin/orbit/templates/${tpl.id}/edit`}
                            icon={<Pencil size={14} />}
                            label="Edit"
                          />
                          <TemplateDuplicateButton templateId={tpl.id} />
                          {!isArchived && (
                            <TemplatePublishToggle
                              currentStatus={tpl.status}
                              templateId={tpl.id}
                              templateName={tpl.name}
                            />
                          )}
                          <TemplateArchiveButton
                            currentStatus={tpl.status}
                            templateId={tpl.id}
                            templateName={tpl.name}
                          />
                          <TemplateDeleteButton
                            templateId={tpl.id}
                            templateName={tpl.name}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BackToTopButton />
    </div>
  );
}
