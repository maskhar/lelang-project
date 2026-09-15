import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const paths = [".env.backend.local", ".env.migration.local", ".env.local"];
if (paths.some((path) => existsSync(path))) {
  throw new Error("Environment file already exists; merge manually instead of overwriting secrets.");
}
const admin = randomBytes(32).toString("hex");
const app = randomBytes(32).toString("hex");
const migrator = randomBytes(32).toString("hex");
const csrf = randomBytes(32).toString("hex");
const rateLimit = randomBytes(32).toString("hex");
const write = (path, lines) => writeFileSync(path, lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
write(paths[0], ["POSTGRES_ADMIN_PASSWORD=" + admin, "POSTGRES_APP_PASSWORD=" + app, "POSTGRES_MIGRATOR_PASSWORD=" + migrator]);
write(paths[1], ["DATABASE_MIGRATION_URL=postgresql://lelang_migrator:" + migrator + "@127.0.0.1:15432/lelang_properti_dev?sslmode=disable"]);
write(paths[2], ["DATABASE_URL=postgresql://lelang_app:" + app + "@127.0.0.1:15432/lelang_properti_dev?sslmode=disable", "AUTH_CSRF_SECRET=" + csrf, "AUTH_RATE_LIMIT_SECRET=" + rateLimit, "APP_BASE_URL=http://localhost:3003", "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=", "GOOGLE_REDIRECT_URI=http://localhost:3003/api/v1/auth/google/callback", "SMTP_HOST=127.0.0.1", "SMTP_PORT=11025"]);
console.log("Local environment created. Secrets were not printed. Do not commit these files.");
