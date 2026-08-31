import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isGoogleConfigured } from "@/lib/auth/settings";
import { requireAdmin } from "@/lib/authz";
import { encryptSecret } from "@/lib/crypto";
import {
  getIntegrationSettingsSummary,
  type IntegrationSettingsPatch,
  updateIntegrationSettings,
} from "@/lib/integration-settings";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

// GET — admin-only. Secret fields are never sent back to the browser, only
// whether one is currently set.
export async function GET() {
  await requireAdmin();
  const summary = await getIntegrationSettingsSummary();
  return NextResponse.json({
    ...summary,
    googleConfigured: await isGoogleConfigured(),
  });
}

const patchSchema = z.object({
  google: z
    .object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
    })
    .optional(),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().int().min(1).max(65_535).optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string().optional(),
    })
    .optional(),
  storage: z
    .object({
      driver: z.enum(["local", "s3", "r2"]).optional(),
      endpoint: z.string().optional(),
      bucket: z.string().optional(),
      region: z.string().optional(),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    })
    .optional(),
});

/** undefined = leave column untouched; "" clears it (stored as null); non-empty sets it, trimmed. */
function plainField(incoming: string | undefined): string | null | undefined {
  if (incoming === undefined) {
    return;
  }
  const trimmed = incoming.trim();
  return trimmed === "" ? null : trimmed;
}

/** Same semantics as plainField, but encrypts non-empty values before storing. */
function secretField(incoming: string | undefined): string | null | undefined {
  if (incoming === undefined) {
    return;
  }
  return incoming === "" ? null : encryptSecret(incoming);
}

// PATCH — admin only. Partial update, one section (smtp/google/storage) at a
// time; only fields present in that section's object are changed. Within a
// section: key omitted = unchanged, "" = clear (fall back to env), non-empty
// = set (encrypted for secret fields).
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError(400, "Invalid request body");
  }
  const { smtp, google, storage } = parsed.data;
  if (!(smtp || google || storage)) {
    return apiError(400, "No settings provided");
  }

  const patch: IntegrationSettingsPatch = {};
  const sections: string[] = [];

  if (smtp) {
    Object.assign(patch, {
      smtpHost: plainField(smtp.host),
      smtpPort: smtp.port ?? undefined,
      smtpUser: plainField(smtp.user),
      smtpPassEncrypted: secretField(smtp.pass),
      emailFrom: plainField(smtp.from),
    });
    sections.push("smtp");
  }

  if (google) {
    Object.assign(patch, {
      googleClientId: plainField(google.clientId),
      googleClientSecretEncrypted: secretField(google.clientSecret),
    });
    sections.push("google");
  }

  if (storage) {
    Object.assign(patch, {
      storageDriver: storage.driver,
      s3Endpoint: plainField(storage.endpoint),
      s3Bucket: plainField(storage.bucket),
      s3Region: plainField(storage.region),
      s3AccessKeyId: plainField(storage.accessKeyId),
      s3SecretAccessKeyEncrypted: secretField(storage.secretAccessKey),
    });
    sections.push("storage");
  }

  // Drop undefined keys so drizzle only touches submitted fields.
  for (const key of Object.keys(patch) as (keyof IntegrationSettingsPatch)[]) {
    if (patch[key] === undefined) {
      delete patch[key];
    }
  }

  const updated = await updateIntegrationSettings(patch, admin.user.id);

  // Never log secret values — only which ones changed.
  await writeAuditLog({
    actorId: admin.user.id,
    action: "integration_settings.updated",
    targetType: "settings",
    metadata: {
      sections,
      smtpPassChanged: "smtpPassEncrypted" in patch,
      googleClientSecretChanged: "googleClientSecretEncrypted" in patch,
      s3SecretAccessKeyChanged: "s3SecretAccessKeyEncrypted" in patch,
    },
  });

  // Built directly from `updated` rather than re-reading via
  // getIntegrationSettingsSummary() — the DB row was just written in this
  // same request, so a fresh read is what we already have in hand.
  return NextResponse.json({
    smtp: {
      host: updated.smtpHost ?? "",
      port: updated.smtpPort ?? 587,
      user: updated.smtpUser ?? "",
      from: updated.emailFrom ?? "",
      hasPassword: !!updated.smtpPassEncrypted,
    },
    google: {
      clientId: updated.googleClientId ?? "",
      hasClientSecret: !!updated.googleClientSecretEncrypted,
    },
    storage: {
      driver:
        (updated.storageDriver as "local" | "s3" | "r2" | null) ?? "local",
      endpoint: updated.s3Endpoint ?? "",
      bucket: updated.s3Bucket ?? "",
      region: updated.s3Region ?? "",
      accessKeyId: updated.s3AccessKeyId ?? "",
      hasSecretAccessKey: !!updated.s3SecretAccessKeyEncrypted,
    },
    updatedAt: updated.updatedAt,
    googleConfigured: await isGoogleConfigured(),
  });
}
