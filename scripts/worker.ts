import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (existsSync(".env")) {
  process.loadEnvFile();
}

const HEARTBEAT_FILE = join(tmpdir(), "worker-heartbeat");
const HEARTBEAT_INTERVAL_MS = 20_000;

async function main() {
  await import("@/lib/env");
  const { startWorker, stopWorker } = await import("@/lib/jobs/boss");

  console.log("Starting Pagevo background worker...");
  await startWorker();

  // Touched on an interval so Docker's HEALTHCHECK (Dockerfile.worker) can
  // tell a hung/crash-looping worker apart from a healthy one — this
  // process has no HTTP server to poll like the app container does.
  await writeFile(HEARTBEAT_FILE, "");
  setInterval(() => {
    writeFile(HEARTBEAT_FILE, "").catch(() => {});
  }, HEARTBEAT_INTERVAL_MS).unref();

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[worker] received ${signal}; draining jobs`);
    await stopWorker();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
