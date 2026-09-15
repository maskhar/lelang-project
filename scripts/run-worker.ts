import { loadEnvFile } from "node:process";
import { getDatabasePool } from "../src/server/db/client";
import { deliverOutbox } from "../src/workers/deliver-outbox";

try { loadEnvFile(".env.local"); } catch { }
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
async function main() {
  try {
    do {
      await deliverOutbox();
      await getDatabasePool().query("delete from app.auth_rate_limits where expires_at < now() - interval '1 day'");
      await getDatabasePool().query("delete from app.oauth_transactions where expires_at < now()");
      if (process.argv.includes("--once")) break;
      if (!stopped) await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!stopped);
  } finally { await getDatabasePool().end(); }
}
main().catch(() => { console.error("Worker failed."); process.exitCode = 1; });
