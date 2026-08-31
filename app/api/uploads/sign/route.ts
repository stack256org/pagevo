import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { fileUploads, users, workspaceStorageUsage } from "@/lib/db/schema";
import {
  BLOCK_MEDIA_MIME_LIMITS,
  getStorage,
  IMAGE_MIME_TYPES,
  SIZE_LIMITS,
  WORKSPACE_QUOTA_BYTES,
} from "@/lib/storage";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const signSchema = z.object({
  kind: z.enum([
    "page_cover",
    "page_icon",
    "block_media",
    "user_avatar",
    "workspace_icon",
    "database_file",
    "template_cover",
  ]),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  workspaceId: z.string().uuid().optional(),
  pageId: z.string().uuid().optional(),
  blockId: z.string().uuid().optional(),
});

// POST /api/uploads/sign
export async function POST(req: Request) {
  try {
    const session = await getSession();

    const body = await req.json();
    const parsed = signSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { kind, mimeType, fileSizeBytes, workspaceId, pageId, blockId } =
      parsed.data;

    // ── MIME type validation ───────────────────────────────────────────────
    const imageOnlyKinds = new Set([
      "page_cover",
      "page_icon",
      "user_avatar",
      "workspace_icon",
      "template_cover",
    ]);
    if (imageOnlyKinds.has(kind) && !IMAGE_MIME_TYPES.has(mimeType)) {
      return apiError(
        400,
        `${kind} only accepts image/jpeg, image/png, image/webp, or image/gif`
      );
    }

    // Built-in template covers are workspace-less, so they escape the
    // per-workspace quota below — restrict them to platform admins.
    if (kind === "template_cover") {
      const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);
      if (user?.role !== "admin") {
        return apiError(403, "Forbidden");
      }
    }

    // ── Size validation ────────────────────────────────────────────────────
    const sizeLimit =
      kind === "block_media"
        ? (BLOCK_MEDIA_MIME_LIMITS[mimeType] ?? SIZE_LIMITS.block_media)
        : SIZE_LIMITS[kind];

    if (!sizeLimit) {
      return apiError(400, "Unknown upload kind");
    }
    if (fileSizeBytes > sizeLimit) {
      const limitMB = Math.round(sizeLimit / 1024 / 1024);
      return apiError(400, `File exceeds the ${limitMB} MB limit for ${kind}`);
    }

    // ── Workspace quota check (user_avatar is exempt) ──────────────────────
    if (kind !== "user_avatar" && workspaceId) {
      const [usage] = await db
        .select({ bytesUsed: workspaceStorageUsage.bytesUsed })
        .from(workspaceStorageUsage)
        .where(eq(workspaceStorageUsage.workspaceId, workspaceId))
        .limit(1);

      const currentBytes = usage?.bytesUsed ?? 0;
      if (currentBytes + fileSizeBytes > WORKSPACE_QUOTA_BYTES) {
        return apiError(409, "Workspace storage quota exceeded (5 GB)");
      }
    }

    // ── Build object key ───────────────────────────────────────────────────
    const ext = mimeType.split("/")[1]?.replace("quicktime", "mov") ?? "bin";
    const fileId = randomUUID();

    const objectKey =
      kind === "user_avatar"
        ? `users/${session.user.id}/${fileId}.${ext}`
        : kind === "template_cover"
          ? `templates/${fileId}.${ext}`
          : `${workspaceId ?? "shared"}/${pageId ?? fileId}/${fileId}.${ext}`;

    // ── Insert unconfirmed file_uploads row ────────────────────────────────
    const storage = await getStorage();
    const fileUrl = storage.getPublicUrl(objectKey);

    const [fileUpload] = await db
      .insert(fileUploads)
      .values({
        workspaceId:
          kind === "user_avatar" || kind === "template_cover"
            ? null
            : (workspaceId ?? null),
        kind,
        pageId: pageId ?? null,
        blockId: blockId ?? null,
        objectKey,
        fileUrl,
        mimeType,
        fileSizeBytes,
        uploadedBy: session.user.id,
        confirmedAt: null,
      })
      .returning({ id: fileUploads.id });

    // ── Generate upload slot ───────────────────────────────────────────────
    const upload = await storage.createUploadSlot({
      objectKey,
      mimeType,
      fileSizeBytes,
    });

    return Response.json({
      fileUploadId: fileUpload.id,
      objectKey,
      fileUrl,
      upload,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
