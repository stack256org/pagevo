import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";
import { requireAdmin } from "@/lib/authz";
import { env } from "@/lib/env";
import { getStorageSettings } from "@/lib/integration-settings";

// POST — admin only. Round-trips a small probe object against the currently
// *saved* storage config (not whatever the form has typed but not submitted
// yet) — put + delete for s3/r2, a writability check for local.
export async function POST() {
  await requireAdmin();
  const settings = await getStorageSettings();

  try {
    if (settings.driver === "local") {
      const dir = env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
      const probePath = path.join(dir, `.write-test-${Date.now()}`);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(probePath, "test");
      await fs.unlink(probePath);
      return NextResponse.json({ ok: true });
    }

    if (
      !(settings.bucket && settings.accessKeyId && settings.secretAccessKey)
    ) {
      return NextResponse.json({
        ok: false,
        error: "Bucket, access key, and secret key are all required to test.",
      });
    }

    const client = new S3Client({
      region: settings.region ?? "auto",
      endpoint: settings.endpoint,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      forcePathStyle: !!settings.endpoint,
    });

    // Mirrors the app's real usage: PutObject on upload, GetObject when the
    // /api/uploads/files proxy serves it, DeleteObject on cleanup.
    const key = `.write-test-${Date.now()}`;
    await client.send(
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        Body: "test",
        ContentType: "text/plain",
      })
    );
    await client.send(
      new GetObjectCommand({ Bucket: settings.bucket, Key: key })
    );
    await client.send(
      new DeleteObjectCommand({ Bucket: settings.bucket, Key: key })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Connection failed.",
    });
  }
}
