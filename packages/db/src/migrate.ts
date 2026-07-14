/**
 * Programmatic migration runner for production (bundled to dist/migrate.cjs).
 * Drizzle's migrator takes an advisory lock, so concurrent starts are safe.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle({ client: pool });
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? "./packages/db/migrations";
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
