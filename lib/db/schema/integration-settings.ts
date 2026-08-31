import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { updatedAt } from "./types";

// Admin-configurable alternative to lib/env.ts's optional vars, set from
// Orbit Admin → Integrations. Singleton row (id always 1), same convention as
// authSettings. A non-null DB value wins over the matching env var per field
// — see lib/integration-settings.ts — so an install that only ever used
// .env sees zero behavior change (this row simply doesn't exist yet).
// `*Encrypted` columns are AES-256-GCM (lib/crypto.ts), never sent to the
// browser in plaintext.
export const integrationSettings = pgTable(
  "integration_settings",
  {
    id: integer("id").primaryKey().default(1),

    // SMTP
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    smtpUser: text("smtp_user"),
    smtpPassEncrypted: text("smtp_pass_encrypted"),
    emailFrom: text("email_from"),

    // Google OAuth — read once at process boot (lib/auth/index.ts); changes
    // need a restart to take effect.
    googleClientId: text("google_client_id"),
    googleClientSecretEncrypted: text("google_client_secret_encrypted"),

    // File storage — driver switch + S3/R2 credentials (both drivers use the
    // same field set, matching lib/env.ts's own S3_* shape). No public/CDN
    // URL field: files are always served through /api/uploads/files, which
    // proxies bytes from whichever driver is active — see
    // lib/storage/drivers/s3.ts and app/api/uploads/files/[...path]/route.ts.
    storageDriver: text("storage_driver"), // "local" | "s3" | "r2"
    s3Endpoint: text("s3_endpoint"),
    s3Bucket: text("s3_bucket"),
    s3Region: text("s3_region"),
    s3AccessKeyId: text("s3_access_key_id"),
    s3SecretAccessKeyEncrypted: text("s3_secret_access_key_encrypted"),

    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [check("integration_settings_singleton_chk", sql`${t.id} = 1`)]
);

export type IntegrationSettings = typeof integrationSettings.$inferSelect;
