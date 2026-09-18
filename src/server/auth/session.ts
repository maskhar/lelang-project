import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseAuthSecrets } from "@/server/env";

export const sessionCookieName = process.env.AUTH_SESSION_COOKIE_NAME || "lelang_session";
export const sessionDurationSeconds = 60 * 60 * 8;
export const sessionMaxActivePerUser = 5;
export const sessionLastSeenThrottleMs = 5 * 60 * 1000;

// Percaya hop pertama X-Forwarded-For/X-Real-IP: aman selama satu-satunya jalan masuk trafik luar
// adalah tunnel/reverse proxy milik operator (lihat docker-compose.yml, app hanya bind loopback +
// carubra-network/maskhar-network). Kalau proxy tidak menyetel header ini, hasilnya null — pemanggil
// (rate limit per-IP) tinggal skip, bukan salah keamanan baru dibanding perilaku sebelumnya.
export function resolveClientIp(request: Pick<Request, "headers">) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

export function clientFingerprint(request: Pick<Request, "headers">) {
  const secret = parseAuthSecrets().rateLimitSecret;
  const ip = resolveClientIp(request) || "";
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || "";
  const digest = (value: string) => value ? createHmac("sha256", secret).update(value).digest("hex") : null;
  return { ipHash: digest(ip), userAgentHash: digest(userAgent) };
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hasMatchingToken(token: string, expectedHash: string) {
  const actual = Buffer.from(hashAuthToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}