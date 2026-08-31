import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import type { JobName, JobPayloads } from "@/lib/jobs/job-names";
import { ensureJobQueues } from "@/lib/jobs/queue-options";
import { normalizePgConnectionString } from "@/lib/pg-connection";

// Use globalThis to survive Next.js hot-reloads in dev without leaking PgBoss connections.
const g = globalThis as unknown as {
  _enqueueBoss?: PgBoss | null;
  _enqueueBossInit?: Promise<PgBoss> | null;
};

if (process.env.NODE_ENV !== "production") {
  g._enqueueBoss ??= null;
  g._enqueueBossInit ??= null;
}

let boss: PgBoss | null = g._enqueueBoss ?? null;
let initPromise: Promise<PgBoss> | null = g._enqueueBossInit ?? null;

async function initBoss() {
  const instance = new PgBoss({
    connectionString: normalizePgConnectionString(env.DATABASE_URL),
    schedule: false,
    supervise: false,
  });

  await instance.start();
  await ensureJobQueues(instance);
  boss = instance;
  if (process.env.NODE_ENV !== "production") {
    g._enqueueBoss = instance;
  }
  return instance;
}

export function getBoss() {
  if (boss) {
    return Promise.resolve(boss);
  }

  if (!initPromise) {
    initPromise = initBoss().catch((error) => {
      boss = null;
      initPromise = null;
      if (process.env.NODE_ENV !== "production") {
        g._enqueueBoss = null;
        g._enqueueBossInit = null;
      }
      throw error;
    });
    if (process.env.NODE_ENV !== "production") {
      g._enqueueBossInit = initPromise;
    }
  }

  return initPromise;
}

export async function enqueueJob<TName extends JobName>(
  jobName: TName,
  payload: JobPayloads[TName],
  options?: {
    singletonKey?: string;
    startAfter?: Date | number | string;
  }
) {
  const instance = await getBoss();
  return instance.send(jobName, payload, options);
}
