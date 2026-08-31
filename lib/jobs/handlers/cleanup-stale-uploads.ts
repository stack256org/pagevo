import { and, inArray, isNull, lt } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { fileUploads } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

// Runs every 30 minutes.
// Deletes storage objects for uploads not confirmed within 30 minutes (abandoned).
export async function handleCleanupStaleUploads(
  _jobs: Job<Record<string, never>>[]
) {
  const storage = await getStorage();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const stale = await db
    .select({ id: fileUploads.id, objectKey: fileUploads.objectKey })
    .from(fileUploads)
    .where(
      and(isNull(fileUploads.confirmedAt), lt(fileUploads.createdAt, cutoff))
    );

  if (stale.length === 0) {
    return { cleaned: 0 };
  }

  // Delete from storage first (idempotent — missing objects are fine)
  await Promise.allSettled(stale.map((r) => storage.delete(r.objectKey)));

  // Delete DB rows; re-check confirmedAt so a race-confirmed upload isn't removed
  await db.delete(fileUploads).where(
    and(
      isNull(fileUploads.confirmedAt),
      inArray(
        fileUploads.id,
        stale.map((r) => r.id)
      )
    )
  );

  return { cleaned: stale.length };
}
