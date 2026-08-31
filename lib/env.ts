import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_SECRET: z
    .string()
    .min(
      32,
      "APP_SECRET must be at least 32 characters — generate one with: openssl rand -base64 32"
    )
    .refine(
      (v) => v !== "replace-with-at-least-32-random-characters",
      "APP_SECRET is still set to the .env.example placeholder — generate a real one with: openssl rand -base64 32"
    ),
  // Stripped here, not per-use-site: a trailing slash otherwise doubles up
  // wherever consumers build `${env.NEXT_PUBLIC_APP_URL}/some/path`.
  NEXT_PUBLIC_APP_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
  // Marketing landing page at "/". Defaults to false so self-hosted/open-source
  // instances go straight to login instead of showing a public marketing page.
  NEXT_PUBLIC_SHOW_LANDING_PAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Self-hosted instances are invite-only by default: only the very first
  // account (which bootstraps the instance) may self-register; every
  // account after that must come through an admin's workspace invite. Set
  // to "true" to keep public self-serve signup open indefinitely instead.
  ALLOW_PUBLIC_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // ── Email ──────────────────────────────────────────────────────────────────
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(
    (v) => (v ? Number(v) : undefined),
    z.number().optional()
  ),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  EMAIL_FROM: optionalString,
  EMAIL_WEBHOOK_SECRET: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // ── File storage ───────────────────────────────────────────────────────────
  // STORAGE_DRIVER: "local" (default) saves to UPLOAD_DIR. "s3"/"r2" upload via
  // presigned PUT URLs. Every driver is *served* through /api/uploads/files,
  // which proxies bytes server-side — no public bucket/CDN URL is needed.
  STORAGE_DRIVER: z.enum(["local", "s3", "r2"]).default("local"),
  // Local driver — absolute or relative path; defaults to <project-root>/uploads
  UPLOAD_DIR: optionalString,
  // S3 / R2 driver — all required when STORAGE_DRIVER is "s3" or "r2". The
  // bucket needs a CORS policy allowing PUT from NEXT_PUBLIC_APP_URL, since
  // uploads still go directly from the browser to the bucket.
  S3_ENDPOINT: optionalString, // leave unset for AWS; set for R2 / MinIO
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.issues);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
