/**
 * One-off CLI: run the Entra directory sync against DATABASE_URL and exit.
 * Usage: pnpm --filter web sync:run
 */
import { runSyncEntra, runSyncGroupCatalog } from "./jobs/sync-entra";
import { runSyncPhotos } from "./jobs/sync-photos";

async function main() {
  console.log("[sync-entra]", await runSyncEntra());
  console.log("[sync-group-catalog]", `imported ${await runSyncGroupCatalog()} groups`);
  if (process.argv.includes("--photos")) {
    console.log("[sync-photos]", await runSyncPhotos());
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
