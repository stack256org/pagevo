import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  inArray,
} from "drizzle-orm";
import Link from "next/link";
import { SetupChecklist } from "@/components/orbit/setup-checklist";
import { db } from "@/lib/db";
import {
  emailOutbox,
  platformAuditLog,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { getQueueSummary } from "@/lib/jobs/queue-inspection";
import { getInstanceSetupStatus } from "@/lib/orbit/setup-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview – Orbit Admin" };

const AVATAR_BG = [
  "bg-primary",
  "bg-error",
  "bg-success",
  "bg-warning",
  "bg-base-content/70",
  "bg-secondary-content",
];
function avatarBg(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_BG[h % AVATAR_BG.length]!;
}

function ago(d: Date | null | undefined) {
  if (!d) {
    return "—";
  }
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ago`;
  }
  if (s < 86_400) {
    return `${Math.floor(s / 3600)}h ago`;
  }
  return `${Math.floor(s / 86_400)}d ago`;
}

const ACTION_META: Record<
  string,
  { label: string; pill: string; iconCls: string; icon: React.ReactNode }
> = {
  "user.signup": {
    label: "User signed up",
    pill: "bg-success/10 text-success",
    iconCls: "bg-success/10 text-success",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <circle cx="5" cy="4.5" r="2" />
        <path d="M1 12c0-2 1.7-3.5 3.5-3.5S9 10 9 12" />
        <path d="M11 5v4M9 7h4" />
      </svg>
    ),
  },
  "user.login": {
    label: "User login",
    pill: "bg-base-200 text-base-content/70",
    iconCls: "bg-base-200 text-base-content/70",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <circle cx="5" cy="4.5" r="2" />
        <path d="M1 12c0-2 1.7-3.5 3.5-3.5S9 10 9 12" />
      </svg>
    ),
  },
  "user.banned": {
    label: "User banned",
    pill: "bg-error/5 text-error",
    iconCls: "bg-error/5 text-error",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <circle cx="7" cy="7" r="5.5" />
        <path d="M3.5 3.5l7 7" />
      </svg>
    ),
  },
  "user.unbanned": {
    label: "User unbanned",
    pill: "bg-success/10 text-success",
    iconCls: "bg-success/10 text-success",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <path d="M2 7l3.5 3.5L12 4" />
      </svg>
    ),
  },
  "user.impersonated": {
    label: "Impersonated",
    pill: "bg-primary/10 text-primary",
    iconCls: "bg-primary/10 text-primary",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <circle cx="5" cy="4.5" r="2" />
        <path d="M1 12c0-2 1.7-3.5 3.5-3.5S9 10 9 12" />
        <path d="M11 7l2 2-2 2M13 9H9" />
      </svg>
    ),
  },
  "user.sessions_revoked": {
    label: "Sessions revoked",
    pill: "bg-primary/10 text-primary",
    iconCls: "bg-primary/10 text-primary",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <path d="M7 2v4l2 2" />
        <circle cx="7" cy="7" r="5" />
      </svg>
    ),
  },
  "workspace.created": {
    label: "Workspace created",
    pill: "bg-primary/10 text-primary",
    iconCls: "bg-primary/10 text-primary",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <rect height="11" rx="1.5" width="11" x="1.5" y="1.5" />
        <path d="M5 7h4M7 5v4" />
      </svg>
    ),
  },
  "workspace.updated": {
    label: "Workspace updated",
    pill: "bg-warning/10 text-warning",
    iconCls: "bg-warning/10 text-warning",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <rect height="11" rx="1.5" width="11" x="1.5" y="1.5" />
        <path d="M4.5 7h5M4.5 9.5h3" />
      </svg>
    ),
  },
  "workspace.deleted": {
    label: "Workspace deleted",
    pill: "bg-error/5 text-error",
    iconCls: "bg-error/5 text-error",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <rect height="11" rx="1.5" width="11" x="1.5" y="1.5" />
        <path d="M4.5 4.5l5 5M9.5 4.5l-5 5" />
      </svg>
    ),
  },
  "workspace.force_deleted": {
    label: "Workspace force-deleted",
    pill: "bg-error/5 text-error",
    iconCls: "bg-error/5 text-error",
    icon: (
      <svg
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 14 14"
      >
        <path d="M2 4h10M5 4V2.5h4V4M11 4l-.7 7.5a1 1 0 01-1 .9H4.7a1 1 0 01-1-.9L3 4" />
      </svg>
    ),
  },
};

export default async function OrbitOverviewPage() {
  const now = new Date();
  const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    [totalUsers],
    [newUsers7d],
    [newUsers30d],
    [totalWorkspaces],
    [emailCount],
    [failedEmailCount],
    [activeWorkspaces30d],
    [activeSessions],
    queues,
    recentUsers,
    recentAudit,
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, day7)),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, day30)),
    db.select({ count: count() }).from(workspaces),
    db.select({ count: count() }).from(emailOutbox),
    db
      .select({ count: count() })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "failed")),
    // "Active workspaces" — any workspace with at least one active member who
    // has logged in (i.e. created a session) in the last 30 days.
    db
      .select({ count: countDistinct(workspaceMembers.workspaceId) })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.status, "active"),
          inArray(
            workspaceMembers.userId,
            db
              .select({ id: sessions.userId })
              .from(sessions)
              .where(gte(sessions.createdAt, day30))
          )
        )
      ),
    // "Current active sessions" — not-yet-expired session rows right now.
    db
      .select({ count: count() })
      .from(sessions)
      .where(gt(sessions.expiresAt, now)),
    getQueueSummary(),
    db.select().from(users).orderBy(desc(users.createdAt)).limit(8),
    db
      .select({
        id: platformAuditLog.id,
        action: platformAuditLog.action,
        targetType: platformAuditLog.targetType,
        targetId: platformAuditLog.targetId,
        createdAt: platformAuditLog.createdAt,
      })
      .from(platformAuditLog)
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(8),
  ]);

  // Real health signal instead of a hardcoded "operational" banner — surfaces
  // the same failure counts already shown on the Email and Queues pages.
  const failedJobsCount = queues
    .filter((q) => q.state === "failed")
    .reduce((s, q) => s + q.count, 0);
  const healthIssues: string[] = [];
  if (failedEmailCount!.count > 0) {
    healthIssues.push(
      `${failedEmailCount!.count} failed email${failedEmailCount!.count === 1 ? "" : "s"}`
    );
  }
  if (failedJobsCount > 0) {
    healthIssues.push(
      `${failedJobsCount} failed job${failedJobsCount === 1 ? "" : "s"}`
    );
  }
  const isHealthy = healthIssues.length === 0;

  const setupStatus = await getInstanceSetupStatus();

  return (
    <div className="space-y-6">
      <SetupChecklist
        appSecretIsPlaceholder={setupStatus.appSecretIsPlaceholder}
        smtpConfigured={setupStatus.smtpConfigured}
        storageConfigured={setupStatus.storageConfigured}
        storageDriver={setupStatus.storageDriver}
      />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content">
            Overview
          </h1>
          <p className="mt-1 text-sm text-base-content/70">
            Platform health, recent registrations, and operator actions.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="relative flex size-2">
              {isHealthy && (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span
                className={`relative inline-flex size-2 rounded-full ${isHealthy ? "bg-success" : "bg-error"}`}
              />
            </span>
            <span
              className={`text-xs font-medium ${isHealthy ? "text-base-content/70" : "font-semibold text-error"}`}
            >
              {isHealthy ? "All systems operational" : healthIssues.join(" · ")}
            </span>
          </div>
          <span className="text-base-300">·</span>
          <span className="text-xs text-base-content/70">
            {queues.length} worker{queues.length === 1 ? "" : "s"} active
          </span>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          href="/orbit-admin/orbit/users"
          icon={
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <circle cx="5.5" cy="5" r="2.5" />
              <path d="M1 14c0-2.5 2-4.5 4.5-4.5S10 11.5 10 14" />
              <path d="M11.5 2.5a2.5 2.5 0 010 5M13 10.5c1.5.5 2.5 1.8 2.5 3.5" />
            </svg>
          }
          label="Total users"
          sub="All registered accounts"
          value={totalUsers!.count}
        />
        <StatCard
          href="/orbit-admin/orbit/users"
          icon={
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <path d="M8 2v4l3 3" />
              <circle cx="8" cy="8" r="6" />
              <path d="M2 8h2M12 8h2M8 14v-2" />
            </svg>
          }
          label="New (7 days)"
          sub="Recent signups"
          value={newUsers7d!.count}
        />
        <StatCard
          href="/orbit-admin/orbit/workspaces"
          icon={
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12" />
              <rect height="13" rx="2" width="13" x="1.5" y="1.5" />
            </svg>
          }
          label="Workspaces"
          sub="On this instance"
          value={totalWorkspaces!.count}
        />
        <StatCard
          href="/orbit-admin/orbit/email"
          icon={
            <svg
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <rect height="9" rx="1.5" width="13" x="1.5" y="3.5" />
              <path d="M1.5 5.5l6.5 4.5 6.5-4.5" />
            </svg>
          }
          label="Email queue"
          sub="Transactional outbox"
          value={emailCount!.count}
        />
      </div>

      {/* ── Secondary strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          className="group flex items-center gap-4 rounded-lg border border-base-300 bg-base-100 px-5 py-4 transition-colors hover:bg-base-200"
          href="/orbit-admin/orbit/analytics"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <svg
              className="size-4 text-primary"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <path d="M1.5 12.5l4-4 3 3 5-6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-base-content">
              {newUsers30d!.count}
            </p>
            <p className="text-xs text-base-content/70">New users (30d)</p>
          </div>
          <svg
            className="size-3.5 shrink-0 text-base-content/50 opacity-0 transition group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            viewBox="0 0 12 12"
          >
            <path d="M2 6h8M7 3l3 3-3 3" />
          </svg>
        </Link>
        <Link
          className="group flex items-center gap-4 rounded-lg border border-base-300 bg-base-100 px-5 py-4 transition-colors hover:bg-base-200"
          href="/orbit-admin/orbit/workspaces"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10">
            <svg
              className="size-4 text-success"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              viewBox="0 0 16 16"
            >
              <path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12" />
              <rect height="13" rx="2" width="13" x="1.5" y="1.5" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-base-content">
              {activeWorkspaces30d!.count}
            </p>
            <p className="text-xs text-base-content/70">
              Active workspaces (30d)
            </p>
          </div>
          <svg
            className="size-3.5 shrink-0 text-base-content/50 opacity-0 transition group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            viewBox="0 0 12 12"
          >
            <path d="M2 6h8M7 3l3 3-3 3" />
          </svg>
        </Link>
        <div className="flex items-center gap-4 rounded-lg border border-base-300 bg-base-100 px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success/10">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-success" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-base-content">
              {activeSessions!.count}
            </p>
            <p className="text-xs text-base-content/70">Active sessions</p>
          </div>
        </div>
      </div>

      {/* ── Bottom panels ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent registrations */}
        <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <div className="flex items-center justify-between border-b border-base-300 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-base-content">
                Recent registrations
              </h2>
              <p className="text-xs text-base-content/70">
                Latest accounts to join
              </p>
            </div>
            <Link
              className="flex items-center gap-1 text-xs font-medium text-base-content/70 transition hover:text-base-content"
              href="/orbit-admin/orbit/users"
            >
              View all
              <svg
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 10 10"
              >
                <path d="M2 5h6M5 2l3 3-3 3" />
              </svg>
            </Link>
          </div>
          <div className="divide-y divide-base-300">
            {recentUsers.map((u) => {
              const displayName = u.name?.trim() || u.email || "?";
              const avatarChar = displayName[0]!.toUpperCase();
              return (
                <Link
                  className="group flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-base-200"
                  href={`/orbit-admin/orbit/users/${u.id}`}
                  key={u.id}
                >
                  <div className="relative shrink-0">
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarBg(u.id)}`}
                    >
                      {avatarChar}
                    </span>
                    {u.banned && (
                      <span className="absolute -right-0.5 -top-0.5 flex size-2.5 items-center justify-center rounded-full border-2 border-base-100 bg-error" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-base-content transition-colors group-hover:text-primary">
                      {u.email}
                    </p>
                    <p
                      className={`truncate text-xs ${u.name?.trim() ? "text-base-content/70" : "text-base-content/50"}`}
                    >
                      {u.name?.trim() || u.email?.split("@")[0] || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-base-content/70">
                      {ago(u.createdAt)}
                    </span>
                    {u.isPlatformAdmin && (
                      <span className="rounded-xs bg-primary/10 px-1.5 py-px text-xs font-semibold text-primary">
                        Admin
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent audit events */}
        <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          <div className="flex items-center justify-between border-b border-base-300 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-base-content">
                Audit events
              </h2>
              <p className="text-xs text-base-content/70">
                Recent operator actions
              </p>
            </div>
            <Link
              className="flex items-center gap-1 text-xs font-medium text-base-content/70 transition hover:text-base-content"
              href="/orbit-admin/orbit/audit"
            >
              View all
              <svg
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                viewBox="0 0 10 10"
              >
                <path d="M2 5h6M5 2l3 3-3 3" />
              </svg>
            </Link>
          </div>
          <div className="divide-y divide-base-300">
            {recentAudit.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-base-200/50">
                  <svg
                    className="size-5 text-base-content/50"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.5"
                    viewBox="0 0 18 18"
                  >
                    <path d="M4 4.5h10M4 8.5h10M4 12.5h6" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-base-content/70">
                  No audit events yet
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  Admin actions will appear here.
                </p>
              </div>
            ) : (
              recentAudit.map((ev) => {
                const meta = ACTION_META[ev.action];
                return (
                  <div
                    className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-base-200"
                    key={ev.id}
                  >
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-md ${meta?.iconCls ?? "bg-base-200 text-base-content/70"}`}
                    >
                      {meta?.icon ?? (
                        <span className="size-2 rounded-full bg-base-content/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-base-content">
                        {meta?.label ?? ev.action}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`rounded-xs border px-1.5 py-px text-xs font-semibold ${meta?.pill ?? "bg-base-200 text-base-content/70 border-base-300"}`}
                        >
                          {ev.targetType}
                        </span>
                        <span className="font-mono text-xs text-base-content/50">
                          {ev.targetId?.slice(0, 8) ?? "—"}…
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-base-content/70">
                      {ago(ev.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  href,
  value,
  label,
  sub,
  icon,
}: {
  href: string;
  value: number;
  label: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      className="group flex flex-col gap-4 rounded-lg border border-base-300 bg-base-100 p-5 transition-colors duration-150 hover:bg-base-200"
      href={href}
    >
      <div className="flex items-start justify-between">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <svg
          className="size-3 text-base-content/50 opacity-0 transition group-hover:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 10 10"
        >
          <path d="M2 5h6M5 2l3 3-3 3" />
        </svg>
      </div>
      <div>
        <p className="text-2xl font-bold leading-none text-base-content">
          {value}
        </p>
        <p className="mt-1.5 text-sm font-medium text-base-content">{label}</p>
        <p className="mt-0.5 text-xs text-base-content/70">{sub}</p>
      </div>
    </Link>
  );
}
