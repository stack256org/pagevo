import type { PgBoss } from "pg-boss";
import { JOB_NAMES, type JobName } from "@/lib/jobs/job-names";

type QueuePolicy = "standard" | "short" | "singleton" | "stately" | "exclusive";

export const QUEUE_OPTIONS: Record<
  JobName,
  {
    expireInSeconds?: number;
    policy?: QueuePolicy;
    retryDelay?: number;
    retryLimit?: number;
  }
> = {
  [JOB_NAMES.EMAIL_SEND]: {
    expireInSeconds: 300,
    policy: "standard",
    retryLimit: 0,
  },
  [JOB_NAMES.EMAIL_OUTBOX_REAP]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 0,
  },
  [JOB_NAMES.SCAFFOLD_HEALTHCHECK]: {
    expireInSeconds: 120,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.WORKSPACE_INVITE_SEND]: {
    expireInSeconds: 600,
    policy: "standard",
    retryLimit: 3,
    retryDelay: 60,
  },
  [JOB_NAMES.PAGE_AUTO_DELETE_EXPIRED_TRASH]: {
    expireInSeconds: 600,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.PAGE_WARN_EXPIRING_TRASH]: {
    expireInSeconds: 600,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.PAGE_EXPORT]: {
    expireInSeconds: 300,
    policy: "standard",
    retryLimit: 2,
    retryDelay: 30,
  },
  [JOB_NAMES.STORAGE_CLEANUP_STALE_UPLOADS]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.STORAGE_CLEANUP_ORPHANED_MEDIA]: {
    expireInSeconds: 600,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.STORAGE_SYNC_USAGE]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.NOTIFICATION_EMAIL_SEND]: {
    expireInSeconds: 300,
    policy: "standard",
    retryLimit: 3,
    retryDelay: 60,
  },
  [JOB_NAMES.NOTIFICATION_DIGEST_SEND]: {
    expireInSeconds: 600,
    policy: "exclusive",
    retryLimit: 2,
  },
  [JOB_NAMES.NOTIFICATION_CLEANUP]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.WORKSPACE_DELETE]: {
    expireInSeconds: 600,
    policy: "standard",
    retryLimit: 2,
    retryDelay: 30,
  },
  [JOB_NAMES.EXPIRE_INVITATIONS]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.NOTIFY_STORAGE_THRESHOLD]: {
    expireInSeconds: 300,
    policy: "exclusive",
    retryLimit: 1,
  },
  [JOB_NAMES.GUEST_INVITE_SEND]: {
    expireInSeconds: 600,
    policy: "standard",
    retryLimit: 3,
    retryDelay: 60,
  },
  [JOB_NAMES.ENTRY_REMINDER_SEND]: {
    expireInSeconds: 60,
    policy: "exclusive",
    retryLimit: 1,
  },
};

export async function ensureJobQueues(boss: PgBoss) {
  for (const [name, options] of Object.entries(QUEUE_OPTIONS)) {
    await boss.createQueue(name, options);
  }
}
