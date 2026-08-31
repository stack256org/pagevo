import { and, eq, lt } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";

export async function handleEmailOutboxReap(
  _jobs: Job<Record<string, never>>[]
) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  await db
    .update(emailOutbox)
    .set({
      lastError:
        "Marked failed by email.outbox-reap after being stuck in sending state.",
      status: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(eq(emailOutbox.status, "sending"), lt(emailOutbox.updatedAt, cutoff))
    );
}
