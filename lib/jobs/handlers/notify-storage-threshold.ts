import { and, isNull, or, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { workspaceStorageUsage } from "@/lib/db/schema";

const QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB in bytes
const THRESHOLD_BYTES = Math.floor(QUOTA_BYTES * 0.9); // 90%

// Runs daily — marks workspaces that crossed the storage threshold
export async function handleNotifyStorageThreshold(
  _jobs: Job<Record<string, never>>[]
) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const overThreshold = await db
    .select({ workspaceId: workspaceStorageUsage.workspaceId })
    .from(workspaceStorageUsage)
    .where(
      and(
        sql`${workspaceStorageUsage.bytesUsed} >= ${THRESHOLD_BYTES}`,
        or(
          isNull(workspaceStorageUsage.thresholdNotifiedAt),
          sql`${workspaceStorageUsage.thresholdNotifiedAt} < ${sevenDaysAgo.toISOString()}::timestamptz`
        )
      )
    );

  for (const { workspaceId } of overThreshold) {
    // TODO: enqueue notification to workspace admins
    await db
      .update(workspaceStorageUsage)
      .set({ thresholdNotifiedAt: new Date() })
      .where(sql`${workspaceStorageUsage.workspaceId} = ${workspaceId}`);
  }
}
