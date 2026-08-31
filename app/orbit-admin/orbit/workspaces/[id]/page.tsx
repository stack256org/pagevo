import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForceDeleteWorkspaceButton } from "@/components/orbit/orbit-admin-actions";
import { db } from "@/lib/db";
import {
  pages,
  users,
  workspaceMembers,
  workspaceStorageUsage,
  workspaces,
} from "@/lib/db/schema";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Workspace Detail – Orbit Admin" };

const QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB — matches app/api/workspaces/[id]/storage/route.ts

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

function avatarCls(str: string) {
  const cls = [
    "bg-primary",
    "bg-error",
    "bg-success",
    "bg-warning",
    "bg-base-content/70",
    "bg-secondary-content",
  ];
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return cls[h % cls.length]!;
}

function _ago(d: Date | null | undefined) {
  if (!d) {
    return "—";
  }
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ago`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h ago`;
  }
  return `${Math.floor(s / 86_400)}d ago`;
}

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!ws) {
    notFound();
  }

  const [members, [pageCount], [storageRow]] = await Promise.all([
    db
      .select({
        id: workspaceMembers.id,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        status: workspaceMembers.status,
        joinedAt: workspaceMembers.joinedAt,
        createdAt: workspaceMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
        userId2: users.id,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, id)),
    db
      .select({ count: count() })
      .from(pages)
      .where(and(eq(pages.workspaceId, id), eq(pages.isDeleted, false))),
    db
      .select({ bytesUsed: workspaceStorageUsage.bytesUsed })
      .from(workspaceStorageUsage)
      .where(eq(workspaceStorageUsage.workspaceId, id))
      .limit(1),
  ]);

  const activeMembers = members.filter((m) => m.status === "active");
  const bytesUsed = Number(storageRow?.bytesUsed ?? 0);
  const storagePct = Math.min((bytesUsed / QUOTA_BYTES) * 100, 100);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          href="/orbit-admin/orbit/workspaces"
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
          Workspaces
        </Link>
        <span className="select-none text-sm font-light text-base-content/50">
          /
        </span>
        <span className="text-xs font-semibold text-base-content">
          {ws.name}
        </span>
      </div>

      {/* Header */}
      <div className="mb-6 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-base-content">
                {ws.name}
              </h1>
              <p className="mt-1 font-mono text-sm text-base-content/70">
                /{ws.slug}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
                Workspace ID
              </p>
              <p className="mt-0.5 font-mono text-xs text-base-content/70 break-all">
                {ws.id}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0 border-t border-base-300 divide-x divide-base-300">
          <div className="px-6 py-4">
            <p className="text-lg font-bold text-primary">
              {activeMembers.length}
            </p>
            <p className="text-xs text-base-content/70">Active members</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-lg font-bold text-primary">{members.length}</p>
            <p className="text-xs text-base-content/70">Total members</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-lg font-bold text-primary">{pageCount!.count}</p>
            <p className="text-xs text-base-content/70">Pages</p>
          </div>
          <div className="px-6 py-4">
            <p
              className={`text-lg font-bold ${storagePct >= 90 ? "text-error" : "text-primary"}`}
            >
              {formatBytes(bytesUsed)}
            </p>
            <p className="text-xs text-base-content/70">
              Storage ({storagePct.toFixed(1)}% of 5 GB)
            </p>
          </div>
          <div className="ml-auto px-6 py-4 text-right">
            <p className="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
              Created
            </p>
            <p className="text-xs text-base-content/70">
              {formatDateTime(ws.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
            <div className="border-b border-base-300 px-5 py-3.5">
              <h2 className="text-xs font-bold text-base-content">
                Workspace details
              </h2>
            </div>
            <div className="divide-y divide-base-300 px-5">
              {[
                { label: "Name", value: ws.name },
                { label: "Slug", value: `/${ws.slug}` },
                { label: "Icon", value: ws.icon ?? "—" },
                {
                  label: "ID",
                  value: (
                    <span className="break-all font-mono text-xs">{ws.id}</span>
                  ),
                },
                { label: "Created", value: formatDateTime(ws.createdAt) },
              ].map((row) => (
                <div
                  className="flex items-baseline justify-between gap-2 py-2.5"
                  key={row.label}
                >
                  <span className="shrink-0 text-xs font-semibold text-base-content/70">
                    {row.label}
                  </span>
                  <span className="min-w-0 text-right text-xs text-base-content">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div className="overflow-hidden rounded-xl border border-error/20 bg-base-100">
            <div className="border-b border-error/10 bg-error/5 px-5 py-3.5">
              <h2 className="text-xs font-bold text-error">Danger zone</h2>
            </div>
            <div className="p-5">
              <p className="mb-3 text-xs leading-relaxed text-base-content/70">
                Force deleting will permanently remove this workspace and all
                its data. This cannot be undone.
              </p>
              <ForceDeleteWorkspaceButton
                workspaceId={id}
                workspaceName={ws.name}
              />
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
            <div className="border-b border-base-300 px-5 py-3.5">
              <h2 className="text-xs font-bold text-base-content">
                Members{" "}
                <span className="ml-1 rounded-full bg-base-200/50 px-2 py-0.5 text-xs font-semibold text-base-content/70">
                  {members.length}
                </span>
              </h2>
            </div>
            {members.length === 0 ? (
              <p className="px-5 py-10 text-center text-xs text-base-content/70">
                No members
              </p>
            ) : (
              <div className="divide-y divide-base-300">
                {members.map((m) => {
                  const label = m.userName ?? m.userEmail ?? "Unknown";
                  const cls = avatarCls(m.userId2 ?? m.id);
                  return (
                    <div
                      className="flex items-center gap-3 px-5 py-3"
                      key={m.id}
                    >
                      {m.userId2 ? (
                        <Link
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white hover:opacity-80 ${cls}`}
                          href={`/orbit-admin/orbit/users/${m.userId2}`}
                        >
                          {label.slice(0, 1).toUpperCase()}
                        </Link>
                      ) : (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-base-200/50 text-xs font-bold text-base-content/70">
                          ?
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-base-content">
                          {m.userEmail ?? "—"}
                        </p>
                        {m.userName && (
                          <p className="text-xs text-base-content/70">
                            {m.userName}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            m.role === "admin" || m.role === "editor"
                              ? "bg-primary/10 text-primary"
                              : "bg-base-200/50 text-base-content/70"
                          }`}
                        >
                          {m.role}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            m.status === "active"
                              ? "bg-success/10 text-success"
                              : m.status === "invited"
                                ? "bg-warning/10 text-warning"
                                : "bg-base-200 text-base-content/70"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              m.status === "active"
                                ? "bg-success"
                                : m.status === "invited"
                                  ? "bg-warning"
                                  : "bg-base-content/40"
                            }`}
                          />
                          {m.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
