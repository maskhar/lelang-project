import "server-only";
import { createHmac } from "node:crypto";
import { getDatabasePool } from "@/server/db/client";
import { getAuthConfig } from "./config";
import { AuthHttpError } from "./http";

async function consume(key: string, limit: number, seconds: number) {
  const keyHash = createHmac("sha256", getAuthConfig().rateLimitSecret).update(key).digest("hex");
  const result = await getDatabasePool().query<{ attempts: number }>(
    "INSERT INTO app.auth_rate_limits (key_hash, attempts, expires_at) VALUES ($1, 1, now() + make_interval(secs => $2)) ON CONFLICT (key_hash) DO UPDATE SET attempts = CASE WHEN auth_rate_limits.expires_at <= now() THEN 1 ELSE LEAST(auth_rate_limits.attempts + 1, $3 + 1) END, expires_at = CASE WHEN auth_rate_limits.expires_at <= now() THEN now() + make_interval(secs => $2) ELSE auth_rate_limits.expires_at END RETURNING attempts",
    [keyHash, seconds, limit],
  );
  if (result.rows[0].attempts > limit) throw new AuthHttpError(429, "LOGIN_RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi nanti.", seconds);
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

export async function consumeRateLimit(key: string, limit: number, seconds: number) {
  await consume(key, limit, seconds);
}
