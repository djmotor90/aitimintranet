/**
 * Background worker: pg-boss consumers + cron schedules.
 * Dev: pnpm worker:dev · Prod: node dist/worker.js (same image as web)
 */
import { PgBoss } from "pg-boss";
import { runSyncEntra, runSyncGroupCatalog } from "./jobs/sync-entra";
import { runSyncPhotos } from "./jobs/sync-photos";

const QUEUES = {
  syncEntra: "sync-entra",
  syncPhotos: "sync-photos",
  syncGroupCatalog: "sync-group-catalog",
} as const;

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
  boss.on("error", (err: Error) => console.error("pg-boss error", err));
  await boss.start();

  for (const queue of Object.values(QUEUES)) {
    await boss.createQueue(queue).catch(() => {});
  }

  const graphConfigured = !!process.env.DAEMON_CLIENT_ID && !!process.env.DAEMON_CLIENT_SECRET;

  await boss.work(QUEUES.syncEntra, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-entra]", await runSyncEntra());
  });

  await boss.work(QUEUES.syncGroupCatalog, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-group-catalog]", `imported ${await runSyncGroupCatalog()} groups`);
  });

  await boss.work(QUEUES.syncPhotos, async () => {
    if (!graphConfigured) throw new Error("Daemon credentials not configured");
    console.log("[sync-photos]", await runSyncPhotos());
  });

  if (graphConfigured) {
    await boss.schedule(QUEUES.syncEntra, "*/30 * * * *"); // every 30 min
    await boss.schedule(QUEUES.syncPhotos, "0 3 * * *"); // daily 03:00
  } else {
    console.warn("DAEMON_CLIENT_ID/SECRET not set — Graph sync schedules disabled");
  }

  console.log("Worker started. Queues:", Object.values(QUEUES).join(", "));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
