import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { passwordSchema } from "@/lib/auth/password";
import { isAuthMethodEnabled } from "@/lib/auth/settings";
import { db } from "@/lib/db";
import { accounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { ApiError, apiError } from "@/lib/workspaces/auth";
import { acceptWorkspaceInviteTx } from "@/lib/workspaces/invites";

type Ctx = { params: Promise<{ token: string }> };

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

// POST /api/invite/:token/set-password — first-time account setup for a
// brand-new invitee (no existing sign-in method). Sets their password,
// signs them in, and accepts the workspace invite, all in one step — no
// separate login page, matching how Notion/Slack/Linear handle this.
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { name, password } = parsed.data;

    const [member] = await db
      .select({
        id: workspaceMembers.id,
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        status: workspaceMembers.status,
        inviteExpires: workspaceMembers.inviteExpires,
        invitedBy: workspaceMembers.invitedBy,
        workspaceSlug: workspaces.slug,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.inviteToken, token))
      .limit(1);

    if (!member) {
      return apiError(404, "Invite not found");
    }
    if (member.status !== "invited") {
      return apiError(409, "Invite already used or expired");
    }
    if (member.inviteExpires && member.inviteExpires < new Date()) {
      await db
        .update(workspaceMembers)
        .set({ status: "expired" })
        .where(eq(workspaceMembers.id, member.id));
      return apiError(410, "Invite has expired");
    }
    if (!member.userId) {
      return apiError(
        500,
        "Invite is missing its account — ask for a new invite"
      );
    }

    if (!(await isAuthMethodEnabled("emailPassword"))) {
      return apiError(
        400,
        "Password sign-in is disabled on this instance. Ask your admin for another way to sign in."
      );
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, member.userId))
      .limit(1);
    if (!user) {
      return apiError(404, "Account not found");
    }

    const [existingCredential] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .limit(1);
    if (existingCredential) {
      return apiError(
        409,
        "This account already has a sign-in method — please log in instead."
      );
    }

    const hashed = await hashPassword(password);

    await db.transaction(async (tx) => {
      await tx.insert(accounts).values({
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashed,
      });
      // Clicking the emailed invite link already proves inbox ownership —
      // no separate email-verification step needed.
      await tx
        .update(users)
        .set({ name, emailVerified: true })
        .where(eq(users.id, user.id));

      await acceptWorkspaceInviteTx(tx, {
        memberId: member.id,
        workspaceId: member.workspaceId,
        userId: user.id,
        invitedBy: member.invitedBy,
        accepterName: name,
      });
    });

    await writeAuditLog({
      actorId: user.id,
      action: "member.joined",
      targetType: "workspace",
      targetId: member.workspaceId,
      metadata: { email: user.email, newAccount: true },
    });

    // Sign them in immediately — same request, no separate login step.
    const signInResponse = await auth.api.signInEmail({
      body: { email: user.email, password },
      asResponse: true,
    });

    const res = Response.json({ workspaceSlug: member.workspaceSlug });
    const setCookies =
      typeof signInResponse.headers.getSetCookie === "function"
        ? signInResponse.headers.getSetCookie()
        : [signInResponse.headers.get("set-cookie")].filter((v): v is string =>
            Boolean(v)
          );
    for (const cookie of setCookies) {
      res.headers.append("set-cookie", cookie);
    }
    return res;
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[invite/set-password]", err);
    // The password + workspace join above already succeeded even if
    // auto-sign-in failed here — send them to log in manually rather than
    // showing an error for something that actually worked.
    return Response.json({ workspaceSlug: null, needsLogin: true });
  }
}
