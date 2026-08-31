import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { AuditActionPill } from "@/components/orbit/audit-action-pill";
import { PaginationControls } from "@/components/orbit/pagination-controls";
import { db } from "@/lib/db";
import { platformAuditLog, users } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit Trail – Orbit Admin" };

const PAGE_SIZE = 25;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const ACTION_META: Record<string, { label: string; pill: string }> = {
  "user.signup": {
    label: "User signed up",
    pill: "bg-success/10 text-success border-success/20",
  },
  "user.banned": {
    label: "User banned",
    pill: "bg-error/5 text-error border-error/20",
  },
  "user.unbanned": {
    label: "User unbanned",
    pill: "bg-success/10 text-success border-success/20",
  },
  "workspace.created": {
    label: "Workspace created",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "workspace.updated": {
    label: "Workspace updated",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  "workspace.deleted": {
    label: "Workspace deleted",
    pill: "bg-error/5 text-error border-error/20",
  },
  "workspace.force_deleted": {
    label: "Workspace force-deleted",
    pill: "bg-error/5 text-error border-error/20",
  },
  "workspace.ownership_transferred": {
    label: "Ownership transferred",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "member.invited": {
    label: "Member invited",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "member.joined": {
    label: "Member joined",
    pill: "bg-success/10 text-success border-success/20",
  },
  "member.role_changed": {
    label: "Role changed",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  "member.removed": {
    label: "Member removed",
    pill: "bg-error/5 text-error border-error/20",
  },
  "session.impersonated": {
    label: "User impersonated",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "session.revoked_all": {
    label: "Sessions revoked",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "template.created": {
    label: "Template created",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "template.updated": {
    label: "Template updated",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  "template.deleted": {
    label: "Template deleted",
    pill: "bg-error/5 text-error border-error/20",
  },
  "template.published": {
    label: "Template published",
    pill: "bg-success/10 text-success border-success/20",
  },
  "template.unpublished": {
    label: "Template unpublished",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  "template.seeded": {
    label: "Templates seeded",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "template.reseeded": {
    label: "Templates re-seeded",
    pill: "bg-warning/10 text-warning border-warning/20",
  },
  "template.icons_updated": {
    label: "Template icons updated",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "email.retried": {
    label: "Email retried",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
  "user.auto_promoted_first_admin": {
    label: "Auto-promoted to admin",
    pill: "bg-primary/10 text-primary border-primary/20",
  },
};

// Fallback for any action type not in ACTION_META — "user.auto_promoted_first_admin"
// → "Auto promoted first admin" — so unmapped actions still read as a label
// instead of a raw dotted/underscored string that can overflow its pill.
function humanizeAction(action: string): string {
  const tail = action.includes(".")
    ? action.slice(action.indexOf(".") + 1)
    : action;
  return tail.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
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

export default async function OrbitAuditPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [events, [totalRow]] = await Promise.all([
    db
      .select({
        id: platformAuditLog.id,
        action: platformAuditLog.action,
        targetType: platformAuditLog.targetType,
        targetId: platformAuditLog.targetId,
        metadata: platformAuditLog.metadata,
        createdAt: platformAuditLog.createdAt,
        actorName: users.name,
        actorEmail: users.email,
        actorId: users.id,
      })
      .from(platformAuditLog)
      .leftJoin(users, eq(platformAuditLog.actorId, users.id))
      .orderBy(desc(platformAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(platformAuditLog),
  ]);

  const totalCount = totalRow?.count ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-base-content">
          Audit Trail
        </h1>
        <p className="mt-1 text-sm text-base-content/70">
          Append-only log of all admin operator actions.
        </p>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
            <strong className="font-bold text-base-content">
              {totalCount}
            </strong>{" "}
            events total
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-200/20 py-24">
          <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-base-200/50">
            <svg
              className="size-7 text-base-content/50"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 20 20"
            >
              <path d="M5 5h10M5 9h10M5 13h6" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-base-content/70">
            No audit events yet
          </p>
          <p className="mt-1 text-xs text-base-content/70">
            Admin actions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-base-300 bg-base-100">
          {/* Header and rows are separate grids, so their column template must be
         explicit and identical: `auto` tracks size to each grid's OWN content,
         which made the header ("ACTOR") resolve to a different width than the
         rows ("Sahaj Tavethiya") and drift out of alignment. Keep the gap and
         text alignment in sync with the row grid below for the same reason. */}
          <div className="grid grid-cols-[11rem_1fr_11rem_9.5rem] gap-2 border-b border-base-300 bg-base-200/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/70">
            <span>Action</span>
            <span className="pl-4">Details</span>
            <span className="pr-6 text-right">Actor</span>
            <span className="text-right">When</span>
          </div>
          <div className="divide-y divide-base-300">
            {events.map((ev) => {
              const meta = ACTION_META[ev.action];
              const md = ev.metadata as Record<string, unknown> | null;
              return (
                <div
                  className="grid grid-cols-[11rem_1fr_11rem_9.5rem] items-center gap-2 px-5 py-3.5 transition-colors hover:bg-base-200"
                  key={ev.id}
                >
                  <span className="min-w-0">
                    <AuditActionPill
                      action={ev.action}
                      hasMeta={!!meta}
                      label={meta?.label ?? humanizeAction(ev.action)}
                      pillClass={
                        meta?.pill ??
                        "bg-base-200 text-base-content/70 border-base-300"
                      }
                    />
                  </span>
                  <div className="min-w-0 pl-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-base-content/70">
                        {ev.targetType}
                      </span>
                      {ev.targetId && (
                        <span className="font-mono text-xs text-base-content/70">
                          {ev.targetId.slice(0, 12)}…
                        </span>
                      )}
                    </div>
                    {md && Object.keys(md).length > 0 && (
                      <p className="mt-0.5 truncate text-xs text-base-content/70">
                        {Object.entries(md)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                    {ev.targetId && ev.targetType === "user" && (
                      <Link
                        className="mt-0.5 text-xs font-semibold text-primary hover:underline"
                        href={`/orbit-admin/orbit/users/${ev.targetId}`}
                      >
                        View user →
                      </Link>
                    )}
                    {ev.targetId && ev.targetType === "workspace" && (
                      <Link
                        className="mt-0.5 text-xs font-semibold text-base-content/70 transition hover:text-primary hover:underline"
                        href={`/orbit-admin/orbit/workspaces/${ev.targetId}`}
                      >
                        View workspace →
                      </Link>
                    )}
                  </div>
                  <div className="min-w-0 pr-6 text-right">
                    {ev.actorEmail ? (
                      <Link
                        className="block truncate text-xs font-semibold text-base-content/70 transition hover:text-primary hover:underline"
                        href={`/orbit-admin/orbit/users/${ev.actorId}`}
                      >
                        {ev.actorName ?? ev.actorEmail}
                      </Link>
                    ) : (
                      <span className="text-xs text-base-content/70">
                        Deleted user
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-xs font-medium text-base-content/70">
                      {ago(ev.createdAt)}
                    </p>
                    <p className="text-xs text-base-content/70">
                      {formatDateTime(ev.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <PaginationControls
          basePath="/orbit-admin/orbit/audit"
          page={page}
          pageSize={PAGE_SIZE}
          query=""
          totalCount={totalCount}
        />
      </div>
    </div>
  );
}
