import { eq } from "drizzle-orm";
import type { DbBlock } from "@/components/editor/serializer";
import { PageIcon } from "@/components/pages/page-icon";
import { db } from "@/lib/db";
import { blocks, pages, publicLinks } from "@/lib/db/schema";
import { PublicPageViewer } from "./public-viewer";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const [link] = await db
    .select({ title: pages.title, icon: pages.icon })
    .from(publicLinks)
    .innerJoin(pages, eq(pages.id, publicLinks.pageId))
    .where(eq(publicLinks.token, token))
    .limit(1);
  return {
    title: link
      ? `${link.icon ? link.icon + " " : ""}${link.title || "Untitled"}`
      : "Page not found",
  };
}

export default async function PublicPage({ params }: Props) {
  const { token } = await params;

  // Validate the public link
  const [link] = await db
    .select({
      isActive: publicLinks.isActive,
      accessLevel: publicLinks.accessLevel,
      pageId: publicLinks.pageId,
    })
    .from(publicLinks)
    .where(eq(publicLinks.token, token))
    .limit(1);

  // Not found or disabled
  if (!link?.isActive) {
    return <NotPublicScreen token={token} />;
  }

  // Load page data
  const [page] = await db
    .select({
      id: pages.id,
      title: pages.title,
      icon: pages.icon,
      coverUrl: pages.coverUrl,
      coverPosition: pages.coverPosition,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(eq(pages.id, link.pageId))
    .limit(1);

  if (!page || page.isDeleted) {
    return <NotPublicScreen token={token} />;
  }

  // Load blocks ordered
  const pageBlocks = await db
    .select()
    .from(blocks)
    .where(eq(blocks.pageId, page.id))
    .orderBy(blocks.orderIndex);

  return (
    <div className="min-h-screen bg-base-200">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between bg-base-200 px-6">
        <a
          className="text-sm font-black tracking-tight text-base-content hover:opacity-70 transition-opacity"
          href="/"
        >
          PAGEVO
        </a>
        <a
          className="rounded-sm bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-content hover:bg-primary/90 transition-colors"
          href={`/auth/login?next=${encodeURIComponent(`/p/${token}`)}`}
        >
          Sign in to Pagevo
        </a>
      </header>

      {/* Cover image */}
      {page.coverUrl && (
        <div className="relative h-64 w-full overflow-hidden bg-base-200 sm:h-75">
          {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
          <img
            alt=""
            className="h-full w-full object-cover"
            src={page.coverUrl}
            style={{
              objectPosition: `center ${(page.coverPosition ?? 0.5) * 100}%`,
            }}
          />
        </div>
      )}

      {/* Page content */}
      <main className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        {/* Title */}
        <div className="mb-8">
          {page.icon && (
            <div
              className={`mb-3 ${page.coverUrl ? "-mt-12 relative z-10" : ""}`}
            >
              <PageIcon icon={page.icon} size={48} />
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-base-content sm:text-4xl">
            {page.title || "Untitled"}
          </h1>
        </div>

        {/* Editor content (read-only) */}
        <PublicPageViewer blocks={pageBlocks as unknown as DbBlock[]} />

        {/* Footer */}
        <div className="mt-16 border-t border-base-300 pt-6 text-center">
          <p className="text-xs text-base-content/70">
            Made with{" "}
            <a
              className="font-semibold text-base-content/70 hover:text-base-content transition-colors"
              href="/"
            >
              Pagevo
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function NotPublicScreen({ token }: { token: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 px-4 text-center">
      <div className="mb-4 text-5xl">🔒</div>
      <h1 className="text-xl font-semibold text-base-content">
        This page is not publicly available
      </h1>
      <p className="mt-2 max-w-sm text-sm text-base-content/70">
        The page you&apos;re looking for is either private or the public link
        has been disabled.
      </p>
      <a
        className="mt-6 rounded-sm bg-primary px-4 py-2.5 text-sm font-semibold text-primary-content hover:bg-primary/90 transition-colors"
        href={`/auth/login?next=${encodeURIComponent(`/p/${token}`)}`}
      >
        Sign in to Pagevo
      </a>
    </div>
  );
}
