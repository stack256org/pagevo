import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { magicLink } from "better-auth/plugins/magic-link";
import { and, desc, eq } from "drizzle-orm";
import { ADMIN_ROLE, PRODUCT_NAME } from "@/config/platform";
import { getUserCount, isRegistrationAllowed } from "@/lib/auth/registration";
import { isAuthMethodEnabled } from "@/lib/auth/settings";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { enqueueEmail } from "@/lib/email";
import { changeEmailTemplate } from "@/lib/email/templates/change-email";
import { magicLinkTemplate } from "@/lib/email/templates/magic-link";
import { resetPasswordTemplate } from "@/lib/email/templates/reset-password";
import { env } from "@/lib/env";
import { getGoogleOAuthSettings } from "@/lib/integration-settings";
import { writeAuditLog } from "@/lib/orbit/audit";

// Read once at module evaluation (process boot) — betterAuth() bakes
// socialProviders into its singleton synchronously, so a credentials change
// saved via Orbit Admin → Integrations only takes effect after a restart.
// Falls back to env-only (or blank) on error rather than throwing: this
// module is evaluated during `next build` too, which deliberately runs
// against an unreachable placeholder DATABASE_URL (see Dockerfile) — build
// must not require a real database connection.
const googleOAuth = await getGoogleOAuthSettings().catch(() => null);

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: env.APP_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  socialProviders: {
    google: {
      clientId: googleOAuth?.clientId ?? "",
      clientSecret: googleOAuth?.clientSecret ?? "",
    },
  },
  // requireLocalEmailVerified must be false: accounts here never get local-verified (no email-verification
  // flow), and Better Auth's default would otherwise permanently block linking Google to them.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: false,
    },
  },
  // `enabled` below just makes the endpoint exist; whether it's actually offered is the DB-backed toggle
  // in lib/auth/settings.ts, enforced per-request in `hooks.before` below.
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      console.log("[reset-password] sending to:", user.email);
      console.log("[reset-password] link:", url);

      // No `accounts` row means this is a first-time password set (invited user or previously
      // magic-link/Google only) — use welcome copy instead of "reset" wording.
      const [existingAccount] = await db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id))
        .limit(1);

      if (!existingAccount) {
        const [pendingInvite] = await db
          .select({ workspaceName: schema.workspaces.name })
          .from(schema.workspaceMembers)
          .innerJoin(
            schema.workspaces,
            eq(schema.workspaces.id, schema.workspaceMembers.workspaceId)
          )
          .where(
            and(
              eq(schema.workspaceMembers.userId, user.id),
              eq(schema.workspaceMembers.status, "invited")
            )
          )
          .orderBy(desc(schema.workspaceMembers.createdAt))
          .limit(1);

        const { html, text } = await resetPasswordTemplate({
          email: user.email,
          resetUrl: url,
          workspaceName: pendingInvite?.workspaceName ?? null,
        });
        await enqueueEmail({
          to: user.email,
          subject: pendingInvite
            ? `You've been invited to ${pendingInvite.workspaceName}`
            : `Set your ${PRODUCT_NAME} password`,
          html,
          text,
        });
        return;
      }

      const { html, text } = await resetPasswordTemplate({
        email: user.email,
        resetUrl: url,
      });
      await enqueueEmail({
        to: user.email,
        subject: `Reset your ${PRODUCT_NAME} password`,
        html,
        text,
      });
    },
  },
  // Deliberately left at default (no sendChangeEmailConfirmation/updateEmailWithoutVerification) so every
  // change-email request verifies the new address first — old email keeps working until then.
  user: {
    changeEmail: {
      enabled: true,
    },
  },
  emailVerification: {
    // Only ever reached via the change-email flow above — this app doesn't
    // require email verification at signup, so there's no other caller.
    sendVerificationEmail: async ({ user, url }) => {
      console.log("[change-email] verification link for:", user.email);
      console.log("[change-email] link:", url);
      const { html, text } = await changeEmailTemplate({
        newEmail: user.email,
        verifyUrl: url,
      });
      await enqueueEmail({
        to: user.email,
        subject: `Confirm your new ${PRODUCT_NAME} email address`,
        html,
        text,
      });
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        // Self-serve signup only bootstraps the first instance-admin account (or stays open if
        // ALLOW_PUBLIC_REGISTRATION=true) — otherwise accounts are admin-invited, not self-signed-up.
        if (!(await isRegistrationAllowed())) {
          throw APIError.from("FORBIDDEN", {
            code: "REGISTRATION_DISABLED",
            message:
              "This instance is invite-only. Ask an administrator for an invite.",
          });
        }
        if (!(await isAuthMethodEnabled("emailPassword"))) {
          throw APIError.from("FORBIDDEN", {
            code: "EMAIL_PASSWORD_DISABLED",
            message:
              "Email and password sign-in is turned off on this instance.",
          });
        }
      }
      if (
        ctx.path === "/sign-in/email" &&
        !(await isAuthMethodEnabled("emailPassword"))
      ) {
        throw APIError.from("FORBIDDEN", {
          code: "EMAIL_PASSWORD_DISABLED",
          message: "Email and password sign-in is turned off on this instance.",
        });
      }
      if (ctx.path === "/sign-in/magic-link") {
        if (!(await isAuthMethodEnabled("magicLink"))) {
          throw APIError.from("FORBIDDEN", {
            code: "MAGIC_LINK_DISABLED",
            message: "Magic-link sign-in is turned off on this instance.",
          });
        }
        // Magic link auto-creates an account for any email that doesn't
        // already have one — reject that up front on an invite-only
        // instance instead of letting it fail later at verify time, so the
        // sender gets an immediate, clear error instead of a dead link.
        const magicLinkEmail = (
          ctx.body as { email?: string } | undefined
        )?.email
          ?.trim()
          .toLowerCase();
        if (magicLinkEmail && !(await isRegistrationAllowed())) {
          const [existingUser] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, magicLinkEmail))
            .limit(1);
          if (!existingUser) {
            throw APIError.from("FORBIDDEN", {
              code: "REGISTRATION_DISABLED",
              message:
                "This instance is invite-only. Ask an administrator for an invite.",
            });
          }
        }
      }
      if (
        ctx.path === "/sign-in/social" &&
        (ctx.body as { provider?: string } | undefined)?.provider ===
          "google" &&
        !(await isAuthMethodEnabled("google"))
      ) {
        throw APIError.from("FORBIDDEN", {
          code: "GOOGLE_DISABLED",
          message: "Google sign-in is turned off on this instance.",
        });
      }
    }),
  },
  plugins: [
    admin({
      impersonationSessionDuration: 60 * 60 * 2,
      allowImpersonatingAdmins: false,
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.log("[magic-link] sending to:", email);
        console.log("[magic-link] link:", url);
        const { html, text } = await magicLinkTemplate({
          email,
          magicLinkUrl: url,
        });
        await enqueueEmail({
          to: email,
          subject: `Sign in to ${PRODUCT_NAME}`,
          html,
          text,
        });
      },
    }),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
  },
  // Guard: reject any session refresh where the session was created via
  // impersonation and the 2-hour hard TTL has elapsed.
  databaseHooks: {
    user: {
      create: {
        // Catch-all for invite-only enforcement: magic-link/Google auto-create user rows with no
        // `/sign-up/*` path for `hooks.before` to intercept. Returning `false` aborts the insert safely.
        before: async () => {
          if (await isRegistrationAllowed()) {
            return;
          }
          return false;
        },
        after: async (user) => {
          console.log(
            `[signup] new account created: ${user.email} (${user.id})`
          );

          try {
            await writeAuditLog({
              actorId: user.id,
              action: "user.signup",
              targetType: "user",
              targetId: user.id,
              metadata: { email: user.email, name: user.name ?? null },
            });
          } catch {
            /* never fail signup due to audit */
          }

          // First account on a fresh install auto-promotes to instance admin (no shell/DB step needed
          // to reach Orbit); `pnpm make:admin` remains available for additional users.
          try {
            const userCount = await getUserCount();
            if (userCount === 1) {
              console.log(
                `[signup] first account on this instance — auto-promoting to platform admin: ${user.email}`
              );
              await db
                .update(schema.users)
                .set({ role: ADMIN_ROLE, isPlatformAdmin: true })
                .where(eq(schema.users.id, user.id));
              await writeAuditLog({
                actorId: user.id,
                action: "user.auto_promoted_first_admin",
                targetType: "user",
                targetId: user.id,
                metadata: { email: user.email },
              });

              // Seed built-in templates immediately rather than leaving a
              // brand-new instance's template gallery empty for up to ~10
              // minutes waiting on the scaffold-healthcheck cron tick.
              const { autoSeedTemplates } = await import(
                "@/lib/jobs/handlers/scaffold-healthcheck"
              );
              await autoSeedTemplates();
            }
          } catch {
            /* never fail signup due to auto-promotion */
          }
        },
      },
    },
    session: {
      update: {
        before: async (session) => {
          const raw = session as Record<string, unknown>;
          if (raw.impersonatedBy && raw.impersonatedAt) {
            const impersonatedAt = new Date(raw.impersonatedAt as string);
            const twoHoursMs = 2 * 60 * 60 * 1000;
            if (Date.now() - impersonatedAt.getTime() > twoHoursMs) {
              return false;
            }
          }
          return { data: session };
        },
      },
    },
  },
});
