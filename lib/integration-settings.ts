import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { integrationSettings } from "@/lib/db/schema";
import { env } from "@/lib/env";

const SINGLETON_ID = 1;

// Unlike auth_settings, every column here is optional (DB value wins per
// field, env var is the fallback) — so there's nothing to lazily create.
// Until the first PATCH via Orbit Admin → Integrations, this row simply
// doesn't exist and every getter below falls through to env entirely.
async function getRow() {
  const [row] = await db
    .select()
    .from(integrationSettings)
    .where(eq(integrationSettings.id, SINGLETON_ID))
    .limit(1);
  return row;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

export interface SmtpSettings {
  from: string;
  host: string;
  pass: string;
  port: number;
  user: string;
}

/** DB value wins per field, env var is the fallback. */
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const row = await getRow();
  const host = nonEmpty(row?.smtpHost) ?? env.SMTP_HOST;
  const user = nonEmpty(row?.smtpUser) ?? env.SMTP_USER;
  const from = nonEmpty(row?.emailFrom) ?? env.EMAIL_FROM;
  const pass = row?.smtpPassEncrypted
    ? decryptSecret(row.smtpPassEncrypted)
    : env.SMTP_PASS;
  const port = row?.smtpPort ?? env.SMTP_PORT ?? 587;

  if (!(host && user && pass && from)) {
    return null;
  }
  return { host, port, user, pass, from };
}

export interface GoogleOAuthSettings {
  clientId: string;
  clientSecret: string;
}

/** Read once at process boot by lib/auth/index.ts, which bakes
 * social-providers into its betterAuth() singleton — so changes here take
 * effect only after a restart. Everywhere else (the "is Google configured"
 * checks) calls this fresh each time. */
export async function getGoogleOAuthSettings(): Promise<GoogleOAuthSettings | null> {
  const row = await getRow();
  const clientId = nonEmpty(row?.googleClientId) ?? env.GOOGLE_CLIENT_ID;
  const clientSecret = row?.googleClientSecretEncrypted
    ? decryptSecret(row.googleClientSecretEncrypted)
    : env.GOOGLE_CLIENT_SECRET;

  if (!(clientId && clientSecret)) {
    return null;
  }
  return { clientId, clientSecret };
}

export interface ResolvedStorageSettings {
  accessKeyId?: string;
  bucket?: string;
  driver: "local" | "s3" | "r2";
  endpoint?: string;
  region?: string;
  secretAccessKey?: string;
}

export async function getStorageSettings(): Promise<ResolvedStorageSettings> {
  const row = await getRow();
  const driver = (nonEmpty(row?.storageDriver) ??
    env.STORAGE_DRIVER) as ResolvedStorageSettings["driver"];

  if (driver !== "s3" && driver !== "r2") {
    return { driver: "local" };
  }

  return {
    driver,
    endpoint: nonEmpty(row?.s3Endpoint) ?? env.S3_ENDPOINT,
    bucket: nonEmpty(row?.s3Bucket) ?? env.S3_BUCKET,
    region: nonEmpty(row?.s3Region) ?? env.S3_REGION,
    accessKeyId: nonEmpty(row?.s3AccessKeyId) ?? env.S3_ACCESS_KEY_ID,
    secretAccessKey: row?.s3SecretAccessKeyEncrypted
      ? decryptSecret(row.s3SecretAccessKeyEncrypted)
      : env.S3_SECRET_ACCESS_KEY,
  };
}

export interface IntegrationSettingsSummary {
  google: { clientId: string; hasClientSecret: boolean };
  smtp: {
    from: string;
    hasPassword: boolean;
    host: string;
    port: number;
    user: string;
  };
  storage: {
    accessKeyId: string;
    bucket: string;
    driver: "local" | "s3" | "r2";
    endpoint: string;
    hasSecretAccessKey: boolean;
    region: string;
  };
  updatedAt: Date | null;
}

/** Prefills the Integrations forms with what was typed and saved via the UI,
 * not the resolved DB+env value — so an env-configured field shows blank
 * rather than being saved back as DB-authoritative. Secrets appear only as
 * booleans, never their value. */
export async function getIntegrationSettingsSummary(): Promise<IntegrationSettingsSummary> {
  const row = await getRow();
  return {
    smtp: {
      host: row?.smtpHost ?? "",
      port: row?.smtpPort ?? 587,
      user: row?.smtpUser ?? "",
      from: row?.emailFrom ?? "",
      hasPassword: !!row?.smtpPassEncrypted,
    },
    google: {
      clientId: row?.googleClientId ?? "",
      hasClientSecret: !!row?.googleClientSecretEncrypted,
    },
    storage: {
      driver: (row?.storageDriver as "local" | "s3" | "r2" | null) ?? "local",
      endpoint: row?.s3Endpoint ?? "",
      bucket: row?.s3Bucket ?? "",
      region: row?.s3Region ?? "",
      accessKeyId: row?.s3AccessKeyId ?? "",
      hasSecretAccessKey: !!row?.s3SecretAccessKeyEncrypted,
    },
    updatedAt: row?.updatedAt ?? null,
  };
}

export type IntegrationSettingsPatch = Partial<{
  emailFrom: string | null;
  googleClientId: string | null;
  googleClientSecretEncrypted: string | null;
  s3AccessKeyId: string | null;
  s3Bucket: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3SecretAccessKeyEncrypted: string | null;
  smtpHost: string | null;
  smtpPassEncrypted: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  storageDriver: string | null;
}>;

/** Upserts the singleton row — it may not exist yet (see getRow() above). */
export async function updateIntegrationSettings(
  patch: IntegrationSettingsPatch,
  updatedBy: string
) {
  const [updated] = await db
    .insert(integrationSettings)
    .values({ id: SINGLETON_ID, ...patch, updatedBy })
    .onConflictDoUpdate({
      target: integrationSettings.id,
      set: { ...patch, updatedBy },
    })
    .returning();
  return updated;
}
