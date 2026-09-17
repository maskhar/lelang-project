import { loadEnvFile } from "node:process";
import { assertBootEnvironment } from "../src/server/env";
import { getDatabasePool } from "../src/server/db/client";
import { deliverOutbox } from "../src/workers/deliver-outbox";

try { loadEnvFile(".env.local"); } catch { }
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
const baseDelayMs = 1000;
const maxDelayMs = 15_000;
let delayMs = baseDelayMs;
let lastCleanupAt = 0;
async function main() {
  assertBootEnvironment("worker");
  try {
    do {
      const processed = await deliverOutbox();
      if (Date.now() - lastCleanupAt >= 60_000) {
        await getDatabasePool().query("delete from app.auth_rate_limits where expires_at < now() - interval '1 day'");
        await getDatabasePool().query("delete from app.oauth_transactions where expires_at < now()");
        lastCleanupAt = Date.now();
      }
      if (process.argv.includes("--once")) break;
      delayMs = processed > 0 ? baseDelayMs : Math.min(maxDelayMs, delayMs * 2);
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, delayMs + Math.floor(Math.random() * 250)));
    } while (!stopped);
  } finally { await getDatabasePool().end(); }
}
main().catch(() => { console.error("Worker failed."); process.exitCode = 1; });
