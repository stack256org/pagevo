import { env } from "@/lib/env";
import { getStorageSettings } from "@/lib/integration-settings";
import { isSmtpConfigured } from "@/lib/smtp/client";

// Loose match on purpose — every placeholder value across .env.example,
// this repo's Dockerfile build-time placeholder, and hand-written examples
// contains one of these words. Better to under-trust a real secret that
// happens to contain "example" than to miss an unrotated placeholder.
const PLACEHOLDER_PATTERN =
  /change-?me|replace-?with|placeholder|your-secret|^example/i;

export async function getInstanceSetupStatus() {
  const storage = await getStorageSettings();
  const storageConfigured =
    storage.driver === "local" ||
    Boolean(
      storage.bucket &&
        storage.region &&
        storage.accessKeyId &&
        storage.secretAccessKey
    );

  return {
    smtpConfigured: await isSmtpConfigured(),
    storageConfigured,
    storageDriver: storage.driver,
    appSecretIsPlaceholder: PLACEHOLDER_PATTERN.test(env.APP_SECRET),
  };
}
