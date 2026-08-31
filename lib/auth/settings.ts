import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authSettings } from "@/lib/db/schema";
import { getGoogleOAuthSettings } from "@/lib/integration-settings";

export type AuthMethod = "emailPassword" | "magicLink" | "google";

const SINGLETON_ID = 1;

// Google is only ever offerable if OAuth credentials are actually
// configured (env var or Orbit Admin → Integrations) — the admin toggle in
// Orbit layers on top of this, it can't turn Google on without real
// credentials present. Note: lib/auth/index.ts reads credentials once at
// process boot, so a credentials change saved here still needs a restart to
// actually take effect for sign-in itself — this check just reflects
// what's currently saved.
export async function isGoogleConfigured() {
  return (await getGoogleOAuthSettings()) !== null;
}

// Singleton row, lazily created on first read so a fresh install doesn't
// need a seed step — every method defaults to enabled (Google still gated
// by isGoogleConfigured() regardless of this row's value).
export async function getAuthSettings() {
  const [existing] = await db
    .select()
    .from(authSettings)
    .where(eq(authSettings.id, SINGLETON_ID))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(authSettings)
    .values({ id: SINGLETON_ID })
    .onConflictDoNothing()
    .returning();
  if (created) {
    return created;
  }

  // Lost a race with a concurrent first-read — the other request's insert
  // already committed the row.
  const [row] = await db
    .select()
    .from(authSettings)
    .where(eq(authSettings.id, SINGLETON_ID))
    .limit(1);
  return row;
}

export async function isAuthMethodEnabled(method: AuthMethod) {
  const settings = await getAuthSettings();
  switch (method) {
    case "emailPassword":
      return settings.emailPasswordEnabled;
    case "magicLink":
      return settings.magicLinkEnabled;
    case "google":
      return settings.googleEnabled && (await isGoogleConfigured());
    default:
      return false;
  }
}

export interface UpdateAuthSettingsInput {
  emailPasswordEnabled?: boolean;
  googleEnabled?: boolean;
  magicLinkEnabled?: boolean;
  updatedBy: string;
}

export class AuthSettingsError extends Error {}

export async function updateAuthSettings(input: UpdateAuthSettingsInput) {
  const current = await getAuthSettings();
  const next = {
    emailPasswordEnabled:
      input.emailPasswordEnabled ?? current.emailPasswordEnabled,
    magicLinkEnabled: input.magicLinkEnabled ?? current.magicLinkEnabled,
    googleEnabled: input.googleEnabled ?? current.googleEnabled,
  };

  if (
    !next.emailPasswordEnabled &&
    !next.magicLinkEnabled &&
    !next.googleEnabled
  ) {
    throw new AuthSettingsError(
      "At least one sign-in method must stay enabled."
    );
  }
  if (next.googleEnabled && !(await isGoogleConfigured())) {
    throw new AuthSettingsError(
      "Google sign-in can't be enabled until a Google client ID and secret are set (via GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or Orbit Admin → Integrations)."
    );
  }

  const [updated] = await db
    .update(authSettings)
    .set({ ...next, updatedBy: input.updatedBy })
    .where(eq(authSettings.id, SINGLETON_ID))
    .returning();
  return updated;
}
