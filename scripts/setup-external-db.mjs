import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requireFromDb = createRequire(resolve(root, "packages/db/package.json"));
const appDatabase = process.argv[2] ?? "aitim_intranet";

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const [{ drizzle }, { migrate }, pg] = await Promise.all([
    import(requireFromDb.resolve("drizzle-orm/node-postgres")),
    import(requireFromDb.resolve("drizzle-orm/node-postgres/migrator")),
    Promise.resolve(requireFromDb("pg")),
  ]);
  const { Pool } = pg;

  const adminUrl = await readStdin();
  if (!adminUrl) throw new Error("Missing admin Postgres URL on stdin");

  const appUrl = new URL(adminUrl);
  appUrl.pathname = `/${appDatabase}`;

  const adminPool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const exists = await adminPool.query("select 1 from pg_database where datname = $1", [
      appDatabase,
    ]);
    if (exists.rowCount === 0) {
      await adminPool.query(`create database ${quoteIdentifier(appDatabase)}`);
      console.log(`Created database ${appDatabase}.`);
    } else {
      console.log(`Database ${appDatabase} already exists.`);
    }
  } finally {
    await adminPool.end();
  }

  const appPool = new Pool({ connectionString: appUrl.toString(), max: 1 });
  try {
    const appDb = drizzle({ client: appPool });
    const migrationsFolder = resolve(root, "packages/db/migrations");
    if (!existsSync(migrationsFolder)) throw new Error(`Missing ${migrationsFolder}`);
    await migrate(appDb, { migrationsFolder });
    console.log(`Ran migrations in ${appDatabase}.`);
  } finally {
    await appPool.end();
  }

  console.log(`Runtime DATABASE_URL database: ${appDatabase}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
