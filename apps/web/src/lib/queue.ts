import { PgBoss } from "pg-boss";

const globalForBoss = globalThis as unknown as { bossStarted?: Promise<PgBoss> };

export const JOBS = {
  syncEntra: "sync-entra",
  syncPhotos: "sync-photos",
} as const;

/** Shared pg-boss instance (publisher in web, worker registers handlers too). */
export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.bossStarted) {
    const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });
    boss.on("error", (err: Error) => console.error("pg-boss error", err));
    globalForBoss.bossStarted = boss.start();
  }
  return globalForBoss.bossStarted;
}

export async function enqueue(name: string, data?: object): Promise<string | null> {
  const boss = await getBoss();
  await boss.createQueue(name).catch(() => {});
  return boss.send(name, data ?? {});
}
