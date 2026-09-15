import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const name = "lelang-test-" + randomUUID();
const password = randomBytes(32).toString("hex");
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error("Ephemeral Docker operation failed.");
  return result.stdout;
}
let started = false;
async function main() {
  let client;
  try {
    docker(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1:25433:5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=lelang_test", "postgres:17.6-bookworm"], { env: { ...process.env, POSTGRES_PASSWORD: password } });
    started = true;
    const url = "postgresql://postgres:" + password + "@127.0.0.1:25433/lelang_test";
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidate = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
      try { await candidate.connect(); client = candidate; break; }
      catch { await candidate.end().catch(() => undefined); await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    if (!client) throw new Error("Ephemeral PostgreSQL did not become ready.");
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    for (const entry of journal.entries) await client.query(await readFile("drizzle/" + entry.tag + ".sql", "utf8"));
    await client.end(); client = undefined;
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "scripts/test-backend.mjs"], { stdio: "inherit", windowsHide: true, env: { ...process.env, DATABASE_URL: url } });
    process.exitCode = result.status ?? 1;
  } finally {
    if (client) await client.end().catch(() => undefined);
    if (started) docker(["stop", name]);
  }
}
main().catch(() => { console.error("Backend test runner failed; production and development volumes were not used."); process.exitCode = 1; });
