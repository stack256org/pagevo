import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import type { ResolvedStorageSettings } from "@/lib/integration-settings";
import type { StorageDriver, UploadSlot } from "./types";

function buildClient(settings: ResolvedStorageSettings): S3Client {
  return new S3Client({
    region: settings.region ?? "auto",
    endpoint: settings.endpoint,
    credentials: {
      accessKeyId: settings.accessKeyId!,
      secretAccessKey: settings.secretAccessKey!,
    },
    // Required for path-style access (Cloudflare R2, MinIO, etc.)
    forcePathStyle: !!settings.endpoint,
  });
}

export function createS3Driver(
  settings: ResolvedStorageSettings
): StorageDriver {
  if (!(settings.bucket && settings.accessKeyId && settings.secretAccessKey)) {
    throw new Error(
      `STORAGE_DRIVER=${settings.driver} requires a bucket, access key, and secret key to all be set (via env vars or Orbit Admin → Integrations).`
    );
  }
  const client = buildClient(settings);
  const bucket = settings.bucket;

  return {
    async createUploadSlot({
      objectKey,
      mimeType,
      fileSizeBytes,
    }): Promise<UploadSlot> {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: mimeType,
        ContentLength: fileSizeBytes,
      });

      const url = await getSignedUrl(client, command, { expiresIn: 900 }); // 15 min

      return {
        url,
        method: "PUT",
        headers: { "Content-Type": mimeType },
      };
    },

    async exists(objectKey): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: objectKey })
        );
        return true;
      } catch {
        return false;
      }
    },

    async delete(objectKey): Promise<void> {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey })
      );
    },

    async download(objectKey): Promise<Buffer> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey })
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error(`Object not found: ${objectKey}`);
      }
      return Buffer.from(bytes);
    },

    getPublicUrl(objectKey): string {
      return `${env.NEXT_PUBLIC_APP_URL}/api/uploads/files/${objectKey}`;
    },
  };
}
