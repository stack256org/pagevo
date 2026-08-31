import { eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { fileUploads } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

function uploadDir(): string {
  return env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

// POST /api/uploads/local  — local-driver only
// Accepts multipart form with fields: file (Blob) + objectKey (string)
export async function POST(req: Request) {
  // Only available when using the local storage driver
  if ((env.STORAGE_DRIVER ?? "local") !== "local") {
    return apiError(404, "Not found");
  }

  try {
    const session = await getSession();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const objectKey = formData.get("objectKey") as string | null;

    if (!file || !objectKey) {
      return apiError(400, "file and objectKey are required");
    }

    // Verify the objectKey belongs to an unconfirmed upload owned by this user
    const [upload] = await db
      .select({
        id: fileUploads.id,
        uploadedBy: fileUploads.uploadedBy,
        confirmedAt: fileUploads.confirmedAt,
      })
      .from(fileUploads)
      .where(eq(fileUploads.objectKey, objectKey))
      .limit(1);

    if (!upload) {
      return apiError(404, "Upload record not found");
    }
    if (upload.uploadedBy !== session.user.id) {
      return apiError(403, "Forbidden");
    }
    if (upload.confirmedAt) {
      return apiError(409, "Upload already confirmed");
    }

    const filePath = path.join(uploadDir(), objectKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
