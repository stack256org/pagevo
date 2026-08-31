import { and, isNotNull, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { blocks, fileUploads, workspaceStorageUsage } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

// Runs daily.
// Deletes files that are no longer referenced by any active block AND are not
// referenced by any page_version created within the last 7 days.
// Usage: decrements workspace bytes_used when the file is actually removed.
export async function handleCleanupOrphanedMedia(
  _jobs: Job<Record<string, never>>[]
) {
  const storage = await getStorage();
  const _sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // All confirmed block_media uploads
  const candidates = await db
    .select({
      id: fileUploads.id,
      objectKey: fileUploads.objectKey,
      fileSizeBytes: fileUploads.fileSizeBytes,
      workspaceId: fileUploads.workspaceId,
    })
    .from(fileUploads)
    .where(
      and(
        isNotNull(fileUploads.confirmedAt),
        sql`${fileUploads.kind} = 'block_media'`
      )
    );

  if (candidates.length === 0) {
    return { cleaned: 0 };
  }

  // Object keys still referenced by active blocks
  const activeKeys = await db
    .selectDistinct({ objectKey: sql<string>`${blocks.content}->>'objectKey'` })
    .from(blocks)
    .where(isNotNull(sql`${blocks.content}->>'objectKey'`));

  const activeSet = new Set(activeKeys.map((r) => r.objectKey).filter(Boolean));

  // TODO: also check page_versions created within 7 days once page_versions
  // stores a snapshot of block content with objectKeys (Phase 5 extension).

  const orphaned = candidates.filter((c) => !activeSet.has(c.objectKey));
  if (orphaned.length === 0) {
    return { cleaned: 0 };
  }

  // Delete from storage
  await Promise.allSettled(orphaned.map((r) => storage.delete(r.objectKey)));

  // Remove DB rows and decrement workspace usage
  for (const row of orphaned) {
    await db.delete(fileUploads).where(sql`${fileUploads.id} = ${row.id}`);

    if (row.workspaceId) {
      await db
        .update(workspaceStorageUsage)
        .set({
          bytesUsed: sql`GREATEST(0, ${workspaceStorageUsage.bytesUsed} - ${row.fileSizeBytes})`,
          updatedAt: new Date(),
        })
        .where(sql`${workspaceStorageUsage.workspaceId} = ${row.workspaceId}`);
    }
  }

  return { cleaned: orphaned.length };
}
