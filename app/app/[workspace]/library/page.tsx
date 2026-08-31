import { eq } from "drizzle-orm";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSearchButton } from "@/components/pages/page-search-button";
import { NewPageButton } from "@/components/workspace/new-page-button";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { getLibraryPage } from "@/lib/pages/library";
import { DEFAULT_PAGE_SIZE } from "@/lib/ui/pagination";
import { getWorkspaceMember } from "@/lib/workspaces/auth";
import { LibraryClient } from "./library-client";

type Props = {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export const metadata = { title: "Library" };

export default async function LibraryPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const { tab: initialTab } = await searchParams;
  const session = await requireSession();

  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  if (!ws) {
    notFound();
  }

  const member = await getWorkspaceMember(ws.id, session.user.id);
  if (!member) {
    notFound();
  }

  // Only the first page of the linked tab is fetched server-side; later changes
  // go through GET /api/workspaces/:id/pages/library instead (see lib/pages/library.ts).
  const initial = await getLibraryPage(ws.id, session.user.id, {
    tab: initialTab,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base-100">
      {/* ── Topbar — matches page editor breadcrumb style ── */}
      <div className="flex h-11 shrink-0 items-center justify-between bg-base-100 px-3">
        <nav className="flex min-w-0 items-center gap-0.5 text-xs">
          <Link
            className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-base-content transition-colors hover:bg-base-200"
            href={`/app/${slug}`}
          >
            <Home className="shrink-0 text-base-content" size={13} />
            <span className="font-medium">{ws.name}</span>
          </Link>
          <ChevronRight className="shrink-0 text-base-content/40" size={12} />
          <span className="px-2 py-1 font-semibold text-base-content/80">
            Library
          </span>
        </nav>

        <div className="ml-2 flex shrink-0 items-center gap-1">
          <PageSearchButton />
          <NewPageButton
            className="flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-70"
            workspaceId={ws.id}
            workspaceSlug={slug}
          >
            <svg
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New page
          </NewPageButton>
        </div>
      </div>

      <LibraryClient
        initial={initial}
        workspaceId={ws.id}
        workspaceSlug={slug}
      />
    </div>
  );
}
