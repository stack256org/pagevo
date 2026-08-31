import { eq, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { fileUploads, workspaceStorageUsage } from "@/lib/db/schema";

// Runs daily.
// Reconciles workspace_storage_usage.bytes_used against the sum of all confirmed
// file_uploads for that workspace — corrects any drift from missed increments/decrements.
export async function handleSyncStorageUsage(
  _jobs: Job<Record<string, never>>[]
) {
  // Compute actual bytes per workspace from confirmed, non-avatar uploads
  const actual = await db
    .select({
      workspaceId: fileUploads.workspaceId,
      totalBytes: sql<number>`SUM(${fileUploads.fileSizeBytes})`.as(
        "total_bytes"
      ),
    })
    .from(fileUploads)
    .where(
      sql`${fileUploads.workspaceId} IS NOT NULL AND ${fileUploads.confirmedAt} IS NOT NULL AND ${fileUploads.kind} != 'user_avatar'`
    )
    .groupBy(fileUploads.workspaceId);

  const now = new Date();
  let synced = 0;

  for (const row of actual) {
    if (!row.workspaceId) {
      continue;
    }
    await db
      .update(workspaceStorageUsage)
      .set({ bytesUsed: row.totalBytes ?? 0, updatedAt: now })
      .where(eq(workspaceStorageUsage.workspaceId, row.workspaceId));
    synced++;
  }

  // Zero out any workspace not in the actual set (all files deleted)
  await db
    .update(workspaceStorageUsage)
    .set({ bytesUsed: 0, updatedAt: now })
    .where(
      sql`${workspaceStorageUsage.workspaceId} NOT IN (${sql.join(
        actual.filter((r) => r.workspaceId).map((r) => sql`${r.workspaceId}`),
        sql`, `
      )})`
    )
    .catch(() => {}); // Safe to ignore if actual is empty (no workspaces to zero)

  return { synced };
}
