import { and, eq } from "drizzle-orm";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, workspaceMembers, workspaces } from "@/lib/db/schema";
import { AcceptInviteClient } from "./accept-invite-client";
import { SetPasswordAcceptClient } from "./set-password-client";
import { WrongAccountError } from "./wrong-account";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  // Look up the invite
  const [member] = await db
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      invitedEmail: workspaceMembers.invitedEmail,
      inviteExpires: workspaceMembers.inviteExpires,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspaceIcon: workspaces.icon,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.inviteToken, token))
    .limit(1);

  if (!member) {
    return renderShareLinkInvite(token);
  }

  if (
    member.status === "expired" ||
    (member.inviteExpires && member.inviteExpires < new Date())
  ) {
    return <InviteError message="This invite link has expired." />;
  }

  if (member.status === "active") {
    return (
      <InviteError
        message="This invite has already been accepted."
        variant="success"
      />
    );
  }

  // Check if viewer is signed in
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    // A brand-new invitee (no existing sign-in method at all) sets a
    // password right here instead of bouncing through a separate login
    // page — same click-to-join UX as an already-registered invitee.
    const [existingAccount] = member.userId
      ? await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.userId, member.userId))
          .limit(1)
      : [];

    if (member.userId && !existingAccount) {
      return (
        <SetPasswordAcceptClient
          invitedEmail={member.invitedEmail}
          role={member.role}
          token={token}
          workspaceIcon={member.workspaceIcon ?? null}
          workspaceName={member.workspaceName}
        />
      );
    }

    // Already has a sign-in method (password/magic-link/Google) — log in
    // with it, then come straight back here to finish accepting.
    redirect(`/auth/login?next=/invite/${token}`);
  }

  // Signed-in user's email must match the invite email (if email-specific invite)
  if (member.invitedEmail && member.invitedEmail !== session.user.email) {
    return (
      <WrongAccountError
        currentEmail={session.user.email}
        invitedEmail={member.invitedEmail}
        token={token}
      />
    );
  }

  // Check if user is already an active member
  const [existing] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, member.workspaceId),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  if (existing) {
    redirect("/platform/post-auth");
  }

  return (
    <AcceptInviteClient
      role={member.role}
      token={token}
      workspaceIcon={member.workspaceIcon ?? null}
      workspaceName={member.workspaceName}
    />
  );
}

// Fallback for tokens that don't match a per-email invite: the workspace's shareable link.
// Unlike an email invite, anyone with an active link token can join at its configured role.
async function renderShareLinkInvite(token: string) {
  const [ws] = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      icon: workspaces.icon,
      inviteLinkActive: workspaces.inviteLinkActive,
      inviteLinkRole: workspaces.inviteLinkRole,
    })
    .from(workspaces)
    .where(eq(workspaces.inviteLinkToken, token))
    .limit(1);

  if (!ws?.inviteLinkActive) {
    return <InviteError message="This invite link is invalid." />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/auth/login?next=/invite/${token}`);
  }

  const [existing] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, ws.id),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  if (existing) {
    redirect("/platform/post-auth");
  }

  return (
    <AcceptInviteClient
      role={ws.inviteLinkRole}
      token={token}
      workspaceIcon={ws.icon ?? null}
      workspaceName={ws.name}
    />
  );
}

function InviteError({
  message,
  variant = "warning",
}: {
  message: string;
  variant?: "warning" | "success";
}) {
  const Icon = variant === "success" ? CheckCircle2 : AlertCircle;
  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md text-center">
        <div
          className={`mx-auto mb-5 flex size-14 items-center justify-center rounded-lg ring-1 ${
            variant === "success"
              ? "bg-primary/10 ring-primary/20"
              : "bg-warning/10 ring-warning/20"
          }`}
        >
          <Icon
            className={`size-6 ${variant === "success" ? "text-primary" : "text-warning"}`}
            strokeWidth={1.5}
          />
        </div>
        <h1 className="mb-2 text-lg font-bold text-base-content">
          Invite Unavailable
        </h1>
        <p className="text-sm leading-relaxed text-base-content/70">
          {message}
        </p>
        <Button asChild className="mt-6">
          <Link href="/platform/post-auth">Go to your workspace</Link>
        </Button>
      </div>
    </main>
  );
}
