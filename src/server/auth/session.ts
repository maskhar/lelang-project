import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const sessionCookieName = process.env.AUTH_SESSION_COOKIE_NAME || "lelang_session";
export const sessionDurationSeconds = 60 * 60 * 8;

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
