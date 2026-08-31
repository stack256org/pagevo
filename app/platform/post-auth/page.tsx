import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  userPreferences,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";

export default async function PostAuthPage() {
  const session = await requireSession();

  // Only auto-accept invites on a brand-new user's first login (no active membership yet); an
  // established user's additional invite still goes through the explicit /invite/[token] screen.
  const [existingActiveMembership] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  const pendingInvites = existingActiveMembership
    ? []
    : await db
        .select({
          id: workspaceMembers.id,
          workspaceId: workspaceMembers.workspaceId,
          slug: workspaces.slug,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(workspaceMembers.userId, session.user.id),
            eq(workspaceMembers.status, "invited")
          )
        );

  if (pendingInvites.length > 0) {
    await db
      .update(workspaceMembers)
      .set({ status: "active", joinedAt: new Date(), inviteToken: null })
      .where(
        and(
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.status, "invited")
        )
      );
    await db
      .update(users)
      .set({ onboardingCompleted: true })
      .where(eq(users.id, session.user.id));
    for (const invite of pendingInvites) {
      await writeAuditLog({
        actorId: session.user.id,
        action: "member.auto_joined",
        targetType: "workspace",
        targetId: invite.workspaceId,
      });
    }
    redirect(`/app/${pendingInvites[0].slug}`);
  }

  // First-time users must complete onboarding before seeing a workspace
  const [freshUser] = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (freshUser && !freshUser.onboardingCompleted) {
    redirect("/platform/onboarding");
  }

  // Redirect to last active workspace if available
  const [prefs] = await db
    .select({ lastWorkspaceId: userPreferences.lastWorkspaceId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, session.user.id))
    .limit(1);

  if (prefs?.lastWorkspaceId) {
    const [ws] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.status, "active")
        )
      )
      .where(eq(workspaces.id, prefs.lastWorkspaceId))
      .limit(1);
    if (ws) {
      redirect(`/app/${ws.slug}`);
    }
  }

  // Fall back to first active workspace membership
  const [firstMembership] = await db
    .select({ slug: workspaces.slug })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  if (firstMembership) {
    redirect(`/app/${firstMembership.slug}`);
  }

  // No workspace yet — send to workspace creation
  redirect("/app/workspaces/new");
}
