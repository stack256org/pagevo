import Link from "next/link";
import { TemplateForm } from "@/components/orbit/template-form";
import { requireAdmin } from "@/lib/authz";

export const metadata = { title: "New Template – Orbit Admin" };

export default async function NewTemplatePage() {
  await requireAdmin();

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
        <span className="font-medium text-base-content">New template</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-base-content">
          New Template
        </h1>
        <p className="mt-1 text-sm text-base-content/70">
          Author a built-in template. Save as draft, then publish to make it
          visible to users.
        </p>
      </div>

      {/* Form */}
      <TemplateForm />
    </div>
  );
}
