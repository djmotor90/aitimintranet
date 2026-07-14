import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

export * from "./schema/index";
export { schema };

const globalForDb = globalThis as unknown as { pool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.pool) {
    globalForDb.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  }
  return globalForDb.pool;
}

export const db = drizzle({ client: getPool(), schema, casing: "snake_case" });
export type Db = typeof db;
