import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fileUploads, workspaceStorageUsage } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

const QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

// GET /api/workspaces/:id/storage
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    const member = await requireWorkspaceMember(id, session.user.id);

    const [row] = await db
      .select({ bytesUsed: workspaceStorageUsage.bytesUsed })
      .from(workspaceStorageUsage)
      .where(eq(workspaceStorageUsage.workspaceId, id))
      .limit(1);

    const bytesUsed = Number(row?.bytesUsed ?? 0);

    let breakdown: Array<{ kind: string; bytes: number }> = [];
    if (member.role === "admin") {
      const rows = await db
        .select({
          kind: fileUploads.kind,
          bytes: sql<string>`COALESCE(SUM(${fileUploads.fileSizeBytes}), 0)`,
        })
        .from(fileUploads)
        .where(
          and(
            eq(fileUploads.workspaceId, id),
            isNotNull(fileUploads.confirmedAt)
          )
        )
        .groupBy(fileUploads.kind);

      breakdown = rows.map((r) => ({
        kind: r.kind ?? "other",
        bytes: Number(r.bytes),
      }));
    }

    return Response.json({
      bytesUsed,
      quotaBytes: QUOTA_BYTES,
      pct: Math.min((bytesUsed / QUOTA_BYTES) * 100, 100),
      breakdown,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
