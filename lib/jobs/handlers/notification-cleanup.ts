import { lt } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export async function handleNotificationCleanup(
  jobs: Job<Record<string, never>>[]
) {
  for (const _job of jobs) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
  }
}
