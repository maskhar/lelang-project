import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { getAuthConfig } from "./config";
import { AuthHttpError } from "./http";

// Executor bisa database pool (default) atau transaksi Drizzle. Kuota signup dikonsumsi di dalam
// transaksi loginWithGoogle agar hanya pendaftaran yang benar-benar commit yang memakan kuota.
type Executor = Pick<ReturnType<typeof getDatabase>, "execute">;

function statement(keyHash: string, limit: number, seconds: number) {
  return sql`INSERT INTO app.auth_rate_limits (key_hash, attempts, expires_at) VALUES (${keyHash}, 1, now() + make_interval(secs => ${seconds})) ON CONFLICT (key_hash) DO UPDATE SET attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, ${limit} + 1) END, expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN now() + make_interval(secs => ${seconds}) ELSE auth_rate_limits.expires_at END RETURNING attempts`;
}

async function consume(key: string, limit: number, seconds: number, executor: Executor = getDatabase(), code = "LOGIN_RATE_LIMITED", message = "Terlalu banyak percobaan. Coba lagi nanti.") {
  const keyHash = createHmac("sha256", getAuthConfig().rateLimitSecret).update(key).digest("hex");
  const result = await executor.execute<{ attempts: number }>(statement(keyHash, limit, seconds));
  if (Number(result.rows[0].attempts) > limit) throw new AuthHttpError(429, code, message, seconds);
}

// Kuota global menahan beban total; kuota per-IP menahan satu sumber membanjiri dan mengunci
// login semua orang lewat kuota global. IP null (proxy tidak menyetel X-Forwarded-For) hanya
// melewati pemeriksaan per-IP — kuota global tetap berlaku. Key di-HMAC sebelum masuk database.
const perIpPerMinute = 20;

export async function limitLoginGlobal() {
  await consume("login:global", 100, 60);
}

export async function limitLoginByIp(ip: string | null) {
  if (ip) await consume("login:ip:" + ip, perIpPerMinute, 60);
}

export async function limitGoogleCallback() {
  await consume("google:callback:global", 100, 60);
}

export async function limitGoogleCallbackByIp(ip: string | null) {
  if (ip) await consume("google:callback:ip:" + ip, perIpPerMinute, 60);
}

// Pendaftaran mandiri (profile baru + role buyer) membuka permukaan abuse baru: kuota terpisah
// dari login supaya banjir akun baru tidak mengunci login akun lama, dan sebaliknya. Key per-IP
// memakai ipHash yang sudah dihitung callback (bukan IP mentah), sama seperti user_sessions.
const signupPerHour = 20;
const signupPerIpPerHour = 3;

export async function limitGoogleSignup(executor: Executor, ipHash: string | null) {
  const message = "Pendaftaran akun baru sedang dibatasi. Coba lagi nanti.";
  await consume("google:signup:global", signupPerHour, 3600, executor, "SIGNUP_RATE_LIMITED", message);
  if (ipHash) await consume("google:signup:ip:" + ipHash, signupPerIpPerHour, 3600, executor, "SIGNUP_RATE_LIMITED", message);
}

export async function consumeRateLimit(key: string, limit: number, seconds: number) {
  await consume(key, limit, seconds);
}
