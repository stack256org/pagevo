import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { ensureJobQueues } from "@/lib/jobs/queue-options";
import { registerHandlers } from "@/lib/jobs/register";
import { normalizePgConnectionString } from "@/lib/pg-connection";
import { sleep } from "@/lib/utils";

const boss = new PgBoss({
  connectionString: normalizePgConnectionString(env.DATABASE_URL),
});

export { boss };

async function startBossWithRetry(maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await boss.start();
      console.log("[worker] pg-boss started");
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = Math.min(2000 * 2 ** (attempt - 1), 30_000);
      console.error(
        `[worker] pg-boss start failed (${attempt}/${maxRetries}); retrying in ${delay / 1000}s`,
        error
      );
      await sleep(delay);
    }
  }
}

export async function startWorker() {
  boss.on("error", (error) => {
    console.error("[worker] pg-boss error", error);
  });

  await startBossWithRetry();
  await ensureJobQueues(boss);
  await registerHandlers(boss);

  console.log("[worker] handlers registered");
}

export async function stopWorker() {
  await boss.stop({ graceful: true });
}
