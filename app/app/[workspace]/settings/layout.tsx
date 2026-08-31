import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { SettingsRightPanel } from "@/components/settings/settings-right-panel";
import { SettingsTopBar } from "@/components/settings/settings-top-bar";
import { SettingsUserProvider } from "@/components/settings/settings-user-context";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { getWorkspaceMember } from "@/lib/workspaces/auth";

type Props = { children: ReactNode; params: Promise<{ workspace: string }> };

export default async function SettingsLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const session = await requireSession();

  const [[ws], [currentUser]] = await Promise.all([
    db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        icon: workspaces.icon,
      })
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1),
    db
      .select({ name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
  ]);

  if (!ws) {
    notFound();
  }

  const member = await getWorkspaceMember(ws.id, session.user.id);
  if (!member) {
    notFound();
  }

  const userEmail = currentUser?.email ?? session.user.email;
  const userName = currentUser?.name ?? null;
  const userImage = currentUser?.image ?? null;

  return (
    <SettingsUserProvider
      initial={{ name: userName, email: userEmail, image: userImage }}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <SettingsTopBar workspaceName={ws.name} workspaceSlug={ws.slug} />
        <div className="flex flex-1 overflow-hidden">
          <SettingsRightPanel
            isAdmin={member.role === "admin"}
            workspaceSlug={ws.slug}
          />
          <div className="flex-1 overflow-y-auto bg-base-100">
            <Suspense fallback={<SettingsPageSkeleton />}>{children}</Suspense>
          </div>
        </div>
      </div>
    </SettingsUserProvider>
  );
}

function SettingsPageSkeleton() {
  return (
    <div className="mx-auto max-w-175 animate-pulse px-4 py-6 sm:px-6 md:px-10 md:py-10">
      {/* Card 1 */}
      <div className="mb-5 rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3 w-24 rounded bg-base-200/60" />
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-base-200" />
          <div className="flex flex-col gap-2.5">
            <div className="h-4 w-32 rounded bg-base-200" />
            <div className="h-3 w-48 rounded bg-base-200/60" />
          </div>
        </div>
      </div>
      {/* Card 2 */}
      <div className="mb-5 rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3 w-20 rounded bg-base-200/60" />
        <div className="space-y-3">
          <div className="h-9 w-full rounded-sm bg-base-200" />
          <div className="h-9 w-full rounded-sm bg-base-200" />
        </div>
      </div>
      {/* Card 3 */}
      <div className="rounded-lg border border-base-300 bg-base-100 p-5">
        <div className="mb-4 h-3 w-28 rounded bg-base-200/60" />
        <div className="space-y-3">
          <div className="h-9 w-full rounded-sm bg-base-200" />
          <div className="h-9 w-3/4 rounded-sm bg-base-200" />
        </div>
      </div>
    </div>
  );
}
