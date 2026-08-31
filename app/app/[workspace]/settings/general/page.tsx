import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceGeneralSection } from "@/components/settings/workspace-general-section";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";

export const metadata: Metadata = { title: "General — Settings" };

type Props = { params: Promise<{ workspace: string }> };

export default async function GeneralSettingsPage({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await requireSession();

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!ws) {
    notFound();
  }

  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, ws.id),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);

  if (member?.role !== "admin") {
    notFound();
  }

  return (
    <WorkspaceGeneralSection
      workspace={{
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        icon: ws.icon,
        defaultPageAccess: ws.defaultPageAccess,
        inviteLinkToken: ws.inviteLinkToken,
        inviteLinkActive: ws.inviteLinkActive,
        inviteLinkRole: ws.inviteLinkRole,
      }}
    />
  );
}
