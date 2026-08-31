import { count, desc, eq } from "drizzle-orm";
import { EmailRetryButton } from "@/components/orbit/email-retry-button";
import { PaginationControls } from "@/components/orbit/pagination-controls";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Email – Orbit Admin" };

const PAGE_SIZE = 10;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const STATUS_CLS: Record<string, { pill: string; dot: string }> = {
  sent: { pill: "bg-success/10 text-success", dot: "bg-success" },
  queued: { pill: "bg-primary/10 text-primary", dot: "bg-primary" },
  sending: { pill: "bg-primary/10 text-primary", dot: "bg-primary/60" },
  failed: { pill: "bg-error/5 text-error", dot: "bg-error" },
};

const TYPE_LABEL: Record<string, string> = {
  notification_email: "Notification",
  digest_email: "Digest",
};

export default async function OrbitEmailPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [outbox, [totalRow], statusCounts] = await Promise.all([
    db
      .select()
      .from(emailOutbox)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: count() }).from(emailOutbox),
    Promise.all(
      (["sent", "queued", "sending", "failed"] as const).map((s) =>
        db
          .select({ cnt: count() })
          .from(emailOutbox)
          .where(eq(emailOutbox.status, s))
          .then(([r]) => ({ status: s, cnt: r?.cnt ?? 0 }))
      )
    ),
  ]);

  const totalCount = totalRow?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content">
            Email
          </h1>
          <p className="mt-1 text-sm text-base-content/70">
            Transactional outbox — delivery status and retry tracking.
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {statusCounts.map((s) => {
            const cls = STATUS_CLS[s.status] ?? STATUS_CLS.queued!;
            return (
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70"
                }
                key={s.status}
              >
                <span className={`size-1.5 rounded-full ${cls.dot}`} />
                <strong className="font-bold text-base-content">{s.cnt}</strong>{" "}
                {s.status}
              </span>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="flex items-center justify-between border-b border-base-300 bg-base-200/20 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-base-content">Outbox</h2>
            <p className="text-xs text-base-content/70">
              All transactional emails, most recent first
            </p>
          </div>
          <span className="rounded-xs bg-base-200 px-2.5 py-1 text-xs font-semibold text-base-content/70">
            {totalCount} total
          </span>
        </div>

        {outbox.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-base-200/50">
              <svg
                className="size-6 text-base-content/50"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.5"
                viewBox="0 0 20 20"
              >
                <rect height="12" rx="2" width="16" x="2" y="4" />
                <path d="M2 7l8 5 8-5" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-base-content/70">
              No emails yet
            </p>
            <p className="mt-0.5 text-xs text-base-content/70">
              Emails will appear here when sent.
            </p>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead>
                <tr className="bg-base-200/40">
                  {["Recipient", "Subject", "Type", "Status", "Time"].map(
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
                {outbox.map((email) => {
                  const cls = STATUS_CLS[email.status] ?? STATUS_CLS.queued!;
                  // There's no dedicated "sent at" column in the schema — updatedAt is
                  // bumped on every status transition, so for a "sent" row it *is* the
                  // send time. For anything still in flight or failed, show when it
                  // was queued instead, labeled accordingly so it's never misleading.
                  const isSent = email.status === "sent";
                  return (
                    <tr
                      className="transition-colors hover:bg-base-200"
                      key={email.id}
                    >
                      <td className="px-5 py-3.5">
                        <p className="truncate text-xs font-semibold text-base-content">
                          {email.recipientEmail}
                        </p>
                      </td>
                      <td className="max-w-55 px-5 py-3.5">
                        <p className="truncate text-xs text-base-content/70">
                          {email.subject}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="whitespace-nowrap rounded-full bg-base-200 px-2.5 py-0.5 text-xs font-semibold text-base-content/70">
                          {TYPE_LABEL[email.type] ?? email.type}
                        </span>
                      </td>
                      <td className="max-w-55 px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls.pill}`}
                          >
                            <span
                              className={`size-1.5 rounded-full ${cls.dot}`}
                            />
                            {email.status}
                          </span>
                          {email.attemptCount > 1 && (
                            <span className="shrink-0 text-2xs font-medium text-base-content/70">
                              {email.attemptCount} attempts
                            </span>
                          )}
                        </div>
                        {email.status === "failed" && (
                          <div className="mt-2 rounded-sm border border-error/20 bg-error/5 px-2.5 py-2">
                            {email.lastError && (
                              <p className="wrap-break-word text-2xs leading-relaxed text-error">
                                {email.lastError}
                              </p>
                            )}
                            <div
                              className={email.lastError ? "mt-2" : undefined}
                            >
                              <EmailRetryButton id={email.id} />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-base-content/70">
                        <p>
                          {formatDateTime(
                            isSent ? email.updatedAt : email.createdAt
                          )}
                        </p>
                        <p className="text-2xs text-base-content/70">
                          {isSent ? "Sent" : "Queued"}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4">
        <PaginationControls
          basePath="/orbit-admin/orbit/email"
          page={page}
          pageSize={PAGE_SIZE}
          query=""
          totalCount={totalCount}
        />
      </div>
    </div>
  );
}
