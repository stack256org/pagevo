import { and, desc, eq, inArray } from "drizzle-orm";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { pages, users, workspaces } from "@/lib/db/schema";
import { getWorkspaceMember } from "@/lib/workspaces/auth";
import { TrashClient } from "./trash-client";

type Props = { params: Promise<{ workspace: string }> };

export const metadata = { title: "Trash" };

export default async function TrashPage({ params }: Props) {
  const { workspace: slug } = await params;
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

  const trashedPages = await db
    .select({
      id: pages.id,
      shortId: pages.shortId,
      title: pages.title,
      icon: pages.icon,
      kind: pages.kind,
      deletedAt: pages.deletedAt,
      deletedBy: pages.deletedBy,
    })
    .from(pages)
    .where(and(eq(pages.workspaceId, ws.id), eq(pages.isDeleted, true)))
    .orderBy(desc(pages.deletedAt));

  // Fetch names for who deleted each page
  const deleterIds = [
    ...new Set(
      trashedPages.map((p) => p.deletedBy).filter(Boolean) as string[]
    ),
  ];
  const userRows =
    deleterIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, deleterIds))
      : [];
  const usersMap = Object.fromEntries(
    userRows.map((u) => [u.id, u.name ?? u.email])
  );

  const enriched = trashedPages.map((p) => ({
    ...p,
    deletedAt: p.deletedAt?.toISOString() ?? null,
    deletedByName: p.deletedBy
      ? (usersMap[p.deletedBy] ?? "Unknown")
      : "Unknown",
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base-100">
      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center justify-between bg-base-100 px-3">
        <nav className="flex items-center gap-0.5 text-xs">
          <Link
            className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-base-content transition-colors hover:bg-base-200"
            href={`/app/${slug}`}
          >
            <Home className="shrink-0 text-base-content" size={13} />
            <span className="font-medium">{ws.name}</span>
          </Link>
          <ChevronRight className="shrink-0 text-base-content/40" size={12} />
          <span className="px-2 py-1 font-semibold text-base-content/80">
            Trash
          </span>
        </nav>
      </div>

      <TrashClient pages={enriched} workspaceSlug={slug} />
    </div>
  );
}
