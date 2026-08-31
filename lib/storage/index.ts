import { getStorageSettings } from "@/lib/integration-settings";
import { createLocalDriver } from "./drivers/local";
import { createS3Driver } from "./drivers/s3";
import type { StorageDriver } from "./drivers/types";

export type { StorageDriver, UploadSlot } from "./drivers/types";

// Deliberately no cached singleton here (unlike the old module-level
// `_driver`): the driver — and its underlying credentials — can now come
// from the DB via Orbit Admin → Integrations, and this runs in both the
// `app` and `worker` processes, each with its own module registry. A cached
// instance in either process would never see a change saved from the other.
// Constructing an S3Client does no network I/O, so reading fresh each call
// costs nothing meaningful.
export async function getStorage(): Promise<StorageDriver> {
  const settings = await getStorageSettings();
  return settings.driver === "s3" || settings.driver === "r2"
    ? createS3Driver(settings)
    : createLocalDriver();
}

/** Per-kind size limits in bytes. Enforced at the presign step. */
export const SIZE_LIMITS: Record<string, number> = {
  page_cover: 5 * 1024 * 1024, //   5 MB
  template_cover: 5 * 1024 * 1024, //   5 MB
  page_icon: 1 * 1024 * 1024, //   1 MB
  user_avatar: 1 * 1024 * 1024, //   1 MB
  workspace_icon: 1 * 1024 * 1024, //   1 MB
  block_media: 100 * 1024 * 1024, // 100 MB ceiling (per-mime enforced below)
  database_file: 50 * 1024 * 1024, //  50 MB
};

/** Per-mime caps that apply within block_media. */
export const BLOCK_MEDIA_MIME_LIMITS: Record<string, number> = {
  "image/jpeg": 10 * 1024 * 1024,
  "image/png": 10 * 1024 * 1024,
  "image/webp": 10 * 1024 * 1024,
  "image/gif": 10 * 1024 * 1024,
  "video/mp4": 50 * 1024 * 1024,
  "video/webm": 50 * 1024 * 1024,
  "video/quicktime": 50 * 1024 * 1024,
  "audio/mpeg": 50 * 1024 * 1024,
  "audio/ogg": 50 * 1024 * 1024,
  "audio/wav": 50 * 1024 * 1024,
  "audio/mp4": 50 * 1024 * 1024,
  "application/pdf": 50 * 1024 * 1024,
};

/** Allowed MIME types for image-only kinds. */
export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const WORKSPACE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
