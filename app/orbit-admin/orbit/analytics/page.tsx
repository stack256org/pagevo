import { and, count, countDistinct, desc, eq, gte, inArray } from "drizzle-orm";
import { TruncatedNameLabel } from "@/components/orbit/truncated-name-label";
import { db } from "@/lib/db";
import {
  emailOutbox,
  notifications,
  pages,
  searchQueryLog,
  sessions,
  users,
  workspaces,
} from "@/lib/db/schema";

export const metadata = { title: "Analytics – Orbit Admin" };

function groupByDay(
  dates: (Date | null | string)[],
  days: number,
  now: Date
): number[] {
  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const raw of dates) {
    if (!raw) {
      continue;
    }
    const key = new Date(raw).toISOString().slice(0, 10);
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return Array.from(map.values());
}

function BarChart({ data, height = 72 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  const gap = 3;
  const barW = 10;
  const totalW = data.length * (barW + gap);
  return (
    <svg
      className="w-full"
      preserveAspectRatio="none"
      viewBox={`0 0 ${totalW} ${height}`}
    >
      {data.map((v, i) => {
        const barH =
          max > 0 ? Math.max((v / max) * (height - 4), v > 0 ? 3 : 0) : 0;
        const x = i * (barW + gap);
        const y = height - barH;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: `data` is a plain number[] time series — bar N *is* the Nth bucket, and the x-offset below is computed from the same index. There is no other identity to key on.
          <g key={i}>
            <rect
              fill="currentColor"
              height={height}
              opacity={0.07}
              rx={2}
              width={barW}
              x={x}
              y={0}
            />
            {barH > 0 && (
              <rect
                fill="currentColor"
                height={barH}
                opacity={0.85}
                rx={2}
                width={barW}
                x={x}
                y={y}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SegBar({
  segments,
}: {
  segments: { label: string; value: number; cls: string; dot: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-base-200/50">
        {segments.map((s) => (
          <div
            className={`h-full ${s.cls}`}
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s) => (
          <div className="flex items-center gap-1.5" key={s.label}>
            <span className={`size-2 rounded-full ${s.dot}`} />
            <span className="text-xs text-base-content/70">
              <span className="font-semibold">{s.value}</span>
              <span className="text-base-content/70"> {s.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function OrbitAnalyticsPage() {
  const now = new Date();
  const day7 = new Date(now.getTime() - 7 * 86_400_000);
  const day14 = new Date(now.getTime() - 14 * 86_400_000);
  const day30 = new Date(now.getTime() - 30 * 86_400_000);

  const [
    [totalUsers],
    [newUsers7d],
    [newUsers30d],
    [totalWorkspaces],
    [totalSessions],
    [activeSessions],
    emailStatusRows,
    usersLast30d,
    workspacesLast30d,
    [prevWeekUsers],
    topWorkspacesByPages,
    [notifTotal],
    [notifRead],
    [searchTotal30d],
    [searchNoResult30d],
    [activatedUsers],
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(users).where(gte(users.createdAt, day7)),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, day30)),
    db.select({ count: count() }).from(workspaces),
    db.select({ count: count() }).from(sessions),
    db
      .select({ count: count() })
      .from(sessions)
      .where(gte(sessions.expiresAt, now)),
    db
      .select({ status: emailOutbox.status, cnt: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(gte(users.createdAt, day30)),
    db
      .select({ createdAt: workspaces.createdAt })
      .from(workspaces)
      .where(gte(workspaces.createdAt, day30)),
    db
      .select({ count: count() })
      .from(users)
      .where(gte(users.createdAt, day14)),
    // "Feature usage by workspace" — page count is the clearest single proxy
    // for how much a workspace is actually being used day to day.
    db
      .select({ workspaceId: pages.workspaceId, cnt: count() })
      .from(pages)
      .where(eq(pages.isDeleted, false))
      .groupBy(pages.workspaceId)
      .orderBy(desc(count()))
      .limit(6),
    db.select({ count: count() }).from(notifications),
    db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.isRead, true)),
    db
      .select({ count: count() })
      .from(searchQueryLog)
      .where(gte(searchQueryLog.createdAt, day30)),
    db
      .select({ count: count() })
      .from(searchQueryLog)
      .where(
        and(
          gte(searchQueryLog.createdAt, day30),
          eq(searchQueryLog.resultCount, 0)
        )
      ),
    // Activation = did this user ever actually use the product (created a
    // page) — not "did they create a workspace." Most users join a teammate's
    // existing workspace via invite, so workspace count badly undercounts
    // real engagement; distinct page authors is the honest signal.
    db.select({ count: countDistinct(pages.createdBy) }).from(pages),
  ]);

  const topWorkspaceIds = topWorkspacesByPages.map((w) => w.workspaceId);
  const topWorkspaceNames =
    topWorkspaceIds.length > 0
      ? await db
          .select({ id: workspaces.id, name: workspaces.name })
          .from(workspaces)
          .where(inArray(workspaces.id, topWorkspaceIds))
      : [];
  const workspaceNameMap = new Map(
    topWorkspaceNames.map((w) => [w.id, w.name])
  );
  const featureUsage = topWorkspacesByPages.map((w) => ({
    // Carried through so the render can key on real workspace identity —
    // display names are not unique across workspaces.
    id: w.workspaceId,
    name: workspaceNameMap.get(w.workspaceId) ?? "Unknown workspace",
    pages: w.cnt,
  }));

  const notificationOpenRate =
    notifTotal!.count > 0
      ? Math.round((notifRead!.count / notifTotal!.count) * 100)
      : 0;
  const searchNoResultRate =
    searchTotal30d!.count > 0
      ? Math.round((searchNoResult30d!.count / searchTotal30d!.count) * 100)
      : 0;

  const userSignups30d = groupByDay(
    usersLast30d.map((u) => u.createdAt),
    30,
    now
  );
  const wsGrowth30d = groupByDay(
    workspacesLast30d.map((w) => w.createdAt),
    30,
    now
  );
  const prev7dUsers = prevWeekUsers!.count - newUsers7d!.count;
  const userTrend = newUsers7d!.count - prev7dUsers;
  const userTrendPct =
    prev7dUsers > 0 ? Math.round((userTrend / prev7dUsers) * 100) : null;

  const emailMap = new Map(emailStatusRows.map((r) => [r.status, r.cnt]));
  const emailSegments = [
    {
      label: "sent",
      value: emailMap.get("sent") ?? 0,
      cls: "bg-success",
      dot: "bg-success",
    },
    {
      label: "queued",
      value: emailMap.get("queued") ?? 0,
      cls: "bg-primary",
      dot: "bg-primary",
    },
    {
      label: "sending",
      value: emailMap.get("sending") ?? 0,
      cls: "bg-primary/60",
      dot: "bg-primary/60",
    },
    {
      label: "failed",
      value: emailMap.get("failed") ?? 0,
      cls: "bg-error",
      dot: "bg-error",
    },
  ];

  const activationRate =
    totalUsers!.count > 0
      ? Math.round((activatedUsers!.count / totalUsers!.count) * 100)
      : 0;

  const kpis = [
    {
      label: "Total users",
      value: totalUsers!.count,
      sub: "All registered accounts",
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 16 16"
        >
          <circle cx="5.5" cy="5" r="2.5" />
          <path d="M1 14c0-2.5 2-4.5 4.5-4.5S10 11.5 10 14" />
          <path d="M11.5 2.5a2.5 2.5 0 010 5M13 10.5c1.5.5 2.5 1.8 2.5 3.5" />
        </svg>
      ),
    },
    {
      label: "New users (7d)",
      value: newUsers7d!.count,
      sub:
        userTrendPct === null
          ? "This week"
          : `${userTrend >= 0 ? "+" : ""}${userTrendPct}% vs prev week`,
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 16 16"
        >
          <path d="M2 11.5l3.5-3.5 2.5 2.5 5-6" />
        </svg>
      ),
    },
    {
      label: "Workspaces",
      value: totalWorkspaces!.count,
      sub: "On this instance",
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 16 16"
        >
          <path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12" />
          <rect height="13" rx="2" width="13" x="1.5" y="1.5" />
        </svg>
      ),
    },
    {
      label: "Total sessions",
      value: totalSessions!.count,
      sub: `${activeSessions!.count} active now`,
      icon: (
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 16 16"
        >
          <path d="M8 2v4l3 3" />
          <circle cx="8" cy="8" r="6" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-base-content/70">
            Platform-wide metrics with real-time data and 30-day trends.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
            <strong className="font-bold text-base-content">
              {activationRate}%
            </strong>{" "}
            activation
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
            <strong className="font-bold text-base-content">
              {activeSessions!.count}
            </strong>{" "}
            active sessions
          </span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((s) => (
          <div
            className="flex flex-col gap-4 rounded-lg border border-base-300 bg-base-100 p-5"
            key={s.label}
          >
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {s.icon}
              </span>
              {s.label === "New users (7d)" && userTrendPct !== null && (
                <span
                  className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    userTrend >= 0
                      ? "bg-success/10 text-success"
                      : "bg-error/5 text-error"
                  }`}
                >
                  {userTrend >= 0 ? (
                    <svg
                      className="size-2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 10 10"
                    >
                      <path d="M5 8V2M2 5l3-3 3 3" />
                    </svg>
                  ) : (
                    <svg
                      className="size-2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 10 10"
                    >
                      <path d="M5 2v6M2 5l3 3 3-3" />
                    </svg>
                  )}
                  {Math.abs(userTrendPct)}%
                </span>
              )}
            </div>
            <div>
              <p className="text-3xl font-bold leading-none text-base-content">
                {s.value}
              </p>
              <p className="mt-1.5 text-xs font-semibold text-base-content">
                {s.label}
              </p>
              <p className="mt-0.5 text-xs text-base-content/70">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          badge={`peak: ${Math.max(...userSignups30d)}/day`}
          subtitle="Daily new registrations — last 30 days"
          title="User signups"
          value={newUsers30d!.count}
          valueLabel="this month"
        >
          <div className="text-primary">
            <BarChart data={userSignups30d} />
          </div>
          <DayLabels days={30} />
        </ChartCard>

        <ChartCard
          badge={`peak: ${Math.max(...wsGrowth30d)}/day`}
          subtitle="New workspaces created — last 30 days"
          title="Workspace growth"
          value={totalWorkspaces!.count}
          valueLabel="total"
        >
          <div className="text-primary">
            <BarChart data={wsGrowth30d} />
          </div>
          <DayLabels days={30} />
        </ChartCard>

        <ChartCard
          badge={`${emailMap.get("failed") ?? 0} failed`}
          subtitle="Delivery status breakdown — all time"
          title="Email queue"
          value={emailSegments.reduce((s, e) => s + e.value, 0)}
          valueLabel="total emails"
        >
          <div className="py-3">
            <SegBar segments={emailSegments} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {emailSegments.map((s) => (
              <div
                className="rounded-md bg-base-200/50 p-3 text-center"
                key={s.label}
              >
                <p
                  className={`text-base font-bold ${s.dot === "bg-success" ? "text-success" : s.dot === "bg-error" ? "text-error" : "text-primary"}`}
                >
                  {s.value}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-base-content/70">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          badge={`${newUsers7d!.count} signups this week`}
          subtitle="User acquisition and product activation"
          title="Growth overview"
          value={activationRate}
          valueLabel="activation rate"
        >
          <div className="mt-2 space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-base-content/70">
                  Users who created a page
                </span>
                <span className="text-xs font-bold text-primary">
                  {activationRate}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-base-200/50">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${activationRate}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "7-day signups",
                  value: newUsers7d!.count,
                  pct:
                    totalUsers!.count > 0
                      ? Math.round(
                          (newUsers7d!.count / totalUsers!.count) * 100
                        )
                      : 0,
                },
                {
                  label: "30-day signups",
                  value: newUsers30d!.count,
                  pct:
                    totalUsers!.count > 0
                      ? Math.round(
                          (newUsers30d!.count / totalUsers!.count) * 100
                        )
                      : 0,
                },
              ].map((r) => (
                <div
                  className="rounded-md border border-base-300 bg-base-200/30 p-3"
                  key={r.label}
                >
                  <p className="text-xl font-bold text-base-content">
                    {r.value}
                  </p>
                  <p className="text-xs font-medium text-base-content/70">
                    {r.label}
                  </p>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-200/50">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${r.pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-base-content/70">
                    {r.pct}% of all users
                  </p>
                </div>
              ))}
            </div>
            {userTrendPct !== null && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 ${userTrend >= 0 ? "bg-success/5" : "bg-error/5"}`}
              >
                <span
                  className={`flex items-center gap-1 text-sm font-bold ${userTrend >= 0 ? "text-success" : "text-error"}`}
                >
                  {userTrend >= 0 ? (
                    <svg
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 10 10"
                    >
                      <path d="M5 8V2M2 5l3-3 3 3" />
                    </svg>
                  ) : (
                    <svg
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      viewBox="0 0 10 10"
                    >
                      <path d="M5 2v6M2 5l3 3 3-3" />
                    </svg>
                  )}
                  {Math.abs(userTrendPct)}%
                </span>
                <span
                  className={`text-xs ${userTrend >= 0 ? "text-success/80" : "text-error/70"}`}
                >
                  vs previous 7-day period ({prev7dUsers} signups)
                </span>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard
          subtitle="Top workspaces ranked by page count"
          title="Feature usage by workspace"
          value={featureUsage.length}
          valueLabel="workspaces shown"
        >
          {featureUsage.length === 0 ? (
            <p className="py-6 text-center text-xs text-base-content/70">
              No workspace activity yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {featureUsage.map((w) => {
                const max = featureUsage[0]!.pages || 1;
                return (
                  <div className="flex items-center gap-3" key={w.id}>
                    <TruncatedNameLabel name={w.name} />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-base-200/50">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(w.pages / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs font-bold text-base-content">
                      {w.pages}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard
          badge={`${notifRead!.count} / ${notifTotal!.count} read`}
          subtitle="Share of notifications marked as read, all time"
          title="Notification open rate"
          value={notificationOpenRate}
          valueLabel="% opened"
        >
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-base-200/50">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${notificationOpenRate}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-base-200/50 p-3 text-center">
              <p className="text-base font-bold text-primary">
                {notifRead!.count}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-base-content/70">
                Read
              </p>
            </div>
            <div className="rounded-md bg-base-200/50 p-3 text-center">
              <p className="text-base font-bold text-base-content">
                {notifTotal!.count - notifRead!.count}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-base-content/70">
                Unread
              </p>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          badge={`${searchNoResultRate}% no results`}
          subtitle="Searches run and no-result rate — last 30 days"
          title="Search usage"
          value={searchTotal30d!.count}
          valueLabel="searches"
        >
          {searchTotal30d!.count === 0 ? (
            <p className="py-6 text-center text-xs text-base-content/70">
              No searches logged in the last 30 days.
            </p>
          ) : (
            <div className="mt-2 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-base-content/70">
                    No-result rate
                  </span>
                  <span
                    className={`text-xs font-bold ${searchNoResultRate > 30 ? "text-error" : "text-primary"}`}
                  >
                    {searchNoResultRate}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-base-200/50">
                  <div
                    className={`h-full rounded-full ${searchNoResultRate > 30 ? "bg-error" : "bg-primary"}`}
                    style={{ width: `${searchNoResultRate}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-base-300 bg-base-200/30 p-3 text-center">
                  <p className="text-xl font-bold text-base-content">
                    {searchTotal30d!.count}
                  </p>
                  <p className="text-xs font-medium text-base-content/70">
                    Total searches
                  </p>
                </div>
                <div className="rounded-md border border-base-300 bg-base-200/30 p-3 text-center">
                  <p className="text-xl font-bold text-base-content">
                    {searchNoResult30d!.count}
                  </p>
                  <p className="text-xs font-medium text-base-content/70">
                    Returned nothing
                  </p>
                </div>
              </div>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  value,
  valueLabel,
  badge,
  children,
}: {
  title: string;
  subtitle: string;
  value: number;
  valueLabel: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-base-content">{title}</h3>
            <p className="text-xs text-base-content/70">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold leading-none text-primary">
              {value}
            </p>
            <p className="mt-0.5 text-xs text-base-content/70">{valueLabel}</p>
            {badge && (
              <p className="mt-0.5 text-xs text-base-content/70">{badge}</p>
            )}
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function DayLabels({ days }: { days: number }) {
  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * 86_400_000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en", { month: "short", day: "numeric" });
  return (
    <div className="mt-1.5 flex justify-between">
      <span className="text-xs text-base-content/70">{fmt(start)}</span>
      <span className="text-xs text-base-content/70">{fmt(now)}</span>
    </div>
  );
}
