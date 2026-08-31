import { count, desc, eq, ilike, or } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AdminSearchBox } from "@/components/orbit/admin-search-box";
import { PaginationControls } from "@/components/orbit/pagination-controls";
import { db } from "@/lib/db";
import { users as usersTable } from "@/lib/db/schema";
import { formatDateTime, getAvatarColor } from "@/lib/utils";

export const metadata = { title: "Users – Orbit Admin" };

const PAGE_SIZE = 25;

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function OrbitUsersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const searchFilter = q
    ? or(ilike(usersTable.email, `%${q}%`), ilike(usersTable.name, `%${q}%`))
    : undefined;

  const [users, [totalCount], [filteredCount], [bannedCount]] =
    await Promise.all([
      db
        .select()
        .from(usersTable)
        .where(searchFilter)
        .orderBy(desc(usersTable.createdAt))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db.select({ count: count() }).from(usersTable),
      searchFilter
        ? db.select({ count: count() }).from(usersTable).where(searchFilter)
        : db.select({ count: count() }).from(usersTable),
      db
        .select({ count: count() })
        .from(usersTable)
        .where(eq(usersTable.banned, true)),
    ]);

  const adminCount = users.filter((u) => u.isPlatformAdmin).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-base-content">
              Users
            </h1>
            <p className="mt-1 text-sm text-base-content/70">
              All registered accounts — ban, impersonate, revoke sessions.
            </p>
          </div>
          <Suspense
            fallback={
              <div className="h-9 w-64 rounded-md bg-base-200 animate-pulse" />
            }
          >
            <AdminSearchBox placeholder="Search by name or email…" />
          </Suspense>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
            <strong className="font-bold text-base-content">
              {totalCount!.count}
            </strong>{" "}
            total
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-base-200 px-2.5 py-1 text-xs font-medium text-base-content/70">
            <strong className="font-bold text-base-content">
              {adminCount}
            </strong>{" "}
            admin{adminCount === 1 ? "" : "s"} on this page
          </span>
          {bannedCount!.count > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-error/5 px-2.5 py-1 text-xs font-medium text-error">
              <strong className="font-bold">{bannedCount!.count}</strong> banned
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="border-b border-base-300 bg-base-200/20 px-5 py-3">
          <p className="text-xs font-semibold text-base-content/70">
            {filteredCount!.count} account
            {filteredCount!.count === 1 ? "" : "s"}
            {q ? ` matching "${q}"` : ""}
          </p>
        </div>
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-semibold text-base-content/70">
              No users found
            </p>
            <p className="mt-1 text-xs text-base-content/70">
              {q
                ? "Try a different name or email."
                : "No accounts registered yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-base-200/40">
                  {["User", "Role", "Status", "Joined", "Action"].map((h) => (
                    <th
                      className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-base-content/70"
                      key={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {users.map((u) => {
                  const displayName = u.name?.trim() || u.email || "?";
                  const avatarChar = displayName[0]!.toUpperCase();
                  const bg = getAvatarColor(displayName);
                  return (
                    <tr
                      className="group transition-colors hover:bg-base-200"
                      key={u.id}
                    >
                      <td className="px-5 py-3">
                        <Link
                          className="flex items-center gap-3 hover:no-underline"
                          href={`/orbit-admin/orbit/users/${u.id}`}
                        >
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${bg}`}
                          >
                            {avatarChar}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-base-content group-hover:text-primary">
                              {u.email}
                            </p>
                            <p
                              className={`text-xs ${u.name?.trim() ? "text-base-content/70" : "text-base-content/50"}`}
                            >
                              {u.name?.trim() || u.email?.split("@")[0] || "—"}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            u.isPlatformAdmin
                              ? "bg-primary/10 text-primary"
                              : "bg-base-200 text-base-content/70"
                          }`}
                        >
                          {u.isPlatformAdmin ? "admin" : "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            u.banned
                              ? "bg-error/5 text-error"
                              : "bg-success/10 text-success"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${u.banned ? "bg-error" : "bg-success"}`}
                          />
                          {u.banned ? "banned" : "active"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-base-content/70">
                        {formatDateTime(u.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          className="inline-flex items-center gap-1 rounded-sm border border-base-300 bg-base-100 px-2.5 py-1.5 text-xs font-semibold text-base-content transition-colors duration-150 hover:border-primary/30 hover:bg-base-200"
                          href={`/orbit-admin/orbit/users/${u.id}`}
                        >
                          View <ArrowRight size={12} />
                        </Link>
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
          basePath="/orbit-admin/orbit/users"
          page={page}
          pageSize={PAGE_SIZE}
          query={q}
          totalCount={filteredCount!.count}
        />
      </div>
    </div>
  );
}
