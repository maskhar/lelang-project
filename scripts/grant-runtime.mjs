import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import pg from "pg";

loadEnvFile(".env.migration.local");
const target = new URL(process.env.DATABASE_MIGRATION_URL);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "15432" || target.pathname !== "/lelang_properti_dev") throw new Error("Runtime grants require local development database.");
const client = new pg.Client({ connectionString: target.toString() });
try {
  await client.connect();
  await client.query(readFileSync("scripts/grant-runtime.sql", "utf8"));
  console.log("Development runtime grants applied; schema and audit mutation privileges restricted.");
} finally {
  await client.end();
}
