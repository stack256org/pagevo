import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { fileUploads, workspaceStorageUsage } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const confirmSchema = z.object({ fileUploadId: z.string().uuid() });

// POST /api/uploads/confirm
export async function POST(req: Request) {
  try {
    const session = await getSession();

    const body = await req.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "fileUploadId is required");
    }

    const { fileUploadId } = parsed.data;

    const [upload] = await db
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.id, fileUploadId))
      .limit(1);

    if (!upload) {
      return apiError(404, "Upload not found");
    }
    if (upload.uploadedBy !== session.user.id) {
      return apiError(403, "Forbidden");
    }
    if (upload.confirmedAt) {
      return Response.json({ fileUrl: upload.fileUrl }); // already confirmed — idempotent
    }

    // Verify the object actually exists in storage
    const storage = await getStorage();
    const exists = await storage.exists(upload.objectKey);
    if (!exists) {
      return apiError(
        422,
        "File not found in storage — upload may have failed"
      );
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      // Mark confirmed
      await tx
        .update(fileUploads)
        .set({ confirmedAt: now })
        .where(eq(fileUploads.id, fileUploadId));

      // Increment workspace storage usage (user_avatar uploads are exempt)
      if (upload.workspaceId) {
        await tx
          .update(workspaceStorageUsage)
          .set({
            bytesUsed: sql`${workspaceStorageUsage.bytesUsed} + ${upload.fileSizeBytes}`,
            updatedAt: now,
          })
          .where(eq(workspaceStorageUsage.workspaceId, upload.workspaceId));
      }
    });

    return Response.json({ fileUrl: upload.fileUrl });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
