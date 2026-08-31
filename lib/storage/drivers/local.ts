import fs from "fs/promises";
import path from "path";
import { env } from "@/lib/env";
import type { StorageDriver, UploadSlot } from "./types";

function uploadDir(): string {
  return env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export function createLocalDriver(): StorageDriver {
  return {
    async createUploadSlot({ objectKey }): Promise<UploadSlot> {
      // Ensure the subdirectory exists for this object key
      const filePath = path.join(uploadDir(), objectKey);
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      return {
        url: `${env.NEXT_PUBLIC_APP_URL}/api/uploads/local`,
        method: "POST",
        headers: {},
      };
    },

    async exists(objectKey): Promise<boolean> {
      try {
        await fs.access(path.join(uploadDir(), objectKey));
        return true;
      } catch {
        return false;
      }
    },

    async delete(objectKey): Promise<void> {
      try {
        await fs.unlink(path.join(uploadDir(), objectKey));
      } catch {
        // File already gone — treat as success
      }
    },

    async download(objectKey): Promise<Buffer> {
      return fs.readFile(path.join(uploadDir(), objectKey));
    },

    getPublicUrl(objectKey): string {
      return `${env.NEXT_PUBLIC_APP_URL}/api/uploads/files/${objectKey}`;
    },
  };
}
