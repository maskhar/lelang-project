import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, hashAuthToken, sessionCookieName } from "./session";
import { getAuthConfig } from "./config";
import { AuthHttpError } from "./http";

const cookieName = "lelang_csrf";
const durationSeconds = 3600;

function signature(payload: string, session: string) {
  return createHmac("sha256", getAuthConfig().csrfSecret).update(payload + ":" + hashAuthToken(session)).digest("hex");
}

export function assertOrigin(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthHttpError(403, "INVALID_ORIGIN", "Origin permintaan tidak valid.");
  }
}

export function issueCsrf(response: NextResponse, session = "") {
  const { secure } = getAuthConfig();
  const token = createSessionToken();
  const payload = token + "." + Math.floor(Date.now() / 1000);
  response.cookies.set(cookieName, payload + "." + signature(payload, session), { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: durationSeconds });
  return token;
}

export function requireCsrf(request: NextRequest) {
  assertOrigin(request);
  const cookie = request.cookies.get(cookieName)?.value || "";
  const header = request.headers.get("x-csrf-token") || "";
  const match = /^([A-Za-z0-9_-]{43})\.([0-9]{10})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match || header !== match[1]) throw new AuthHttpError(403, "INVALID_CSRF", "Token CSRF tidak valid.");
  const age = Math.floor(Date.now() / 1000) - Number(match[2]);
  const expected = signature(match[1] + "." + match[2], request.cookies.get(sessionCookieName)?.value || "");
  if (age < 0 || age > durationSeconds || !timingSafeEqual(Buffer.from(match[3], "hex"), Buffer.from(expected, "hex"))) {
    throw new AuthHttpError(403, "INVALID_CSRF", "Token CSRF tidak valid.");
  }
}
