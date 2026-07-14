import { db, users } from "@aitim/db";
import { eq, isNotNull } from "drizzle-orm";
import { graphFetch } from "@/lib/graph/app-client";
import { BUCKETS, putObject } from "@/lib/storage";

export async function runSyncPhotos(): Promise<string> {
  const rows = await db
    .select({ id: users.id, entraObjectId: users.entraObjectId })
    .from(users)
    .where(isNotNull(users.entraObjectId));

  let updated = 0;
  for (const user of rows) {
    try {
      const res = await graphFetch(`/users/${user.entraObjectId}/photos/96x96/$value`);
      if (!res.ok) continue; // 404 = no photo
      const buffer = Buffer.from(await res.arrayBuffer());
      const key = `${user.id}.jpg`;
      await putObject(BUCKETS.photos, key, buffer, res.headers.get("content-type") ?? "image/jpeg");
      await db.update(users).set({ photoKey: key }).where(eq(users.id, user.id));
      updated++;
    } catch (err) {
      console.error(`photo sync failed for user ${user.id}`, err);
    }
  }
  return `cached ${updated}/${rows.length} photos`;
}
