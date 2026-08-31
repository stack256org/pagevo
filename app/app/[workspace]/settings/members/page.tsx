import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceMembersSection } from "@/components/settings/workspace-members-section";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Members — Settings" };

type Props = { params: Promise<{ workspace: string }> };

export default async function MembersSettingsPage({ params }: Props) {
  const { workspace: slug } = await params;
  const session = await requireSession();

  const [ws] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      createdBy: workspaces.createdBy,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  if (!ws) {
    notFound();
  }

  const [myMember] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, ws.id),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);

  if (!myMember) {
    notFound();
  }

  const members = await db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      invitedEmail: workspaceMembers.invitedEmail,
      inviteExpires: workspaceMembers.inviteExpires,
      joinedAt: workspaceMembers.joinedAt,
      createdAt: workspaceMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ws.id));

  // The owner (workspace.createdBy) is the only one who can grant/revoke
  // the Admin role for others — falls back to "any admin" if the original
  // owner's account no longer exists, mirroring the server-side check.
  const isOwner = ws.createdBy === null || ws.createdBy === session.user.id;

  return (
    <WorkspaceMembersSection
      currentUserId={session.user.id}
      isAdmin={myMember.role === "admin"}
      isOwner={isOwner}
      members={members}
      ownerUserId={ws.createdBy}
      workspaceId={ws.id}
      workspaceName={ws.name}
    />
  );
}
