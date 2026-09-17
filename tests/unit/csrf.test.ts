import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { issueCsrf, requireCsrf, assertOrigin } from "../../src/server/auth/csrf";

const origin = "http://localhost:3000";
const csrfCookie = "lelang_csrf";

function requestWith(headers: Record<string, string>, cookies: Record<string, string> = {}) {
  const request = new NextRequest(origin + "/api/v1/test", { method: "POST", headers: { origin, ...headers } });
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return request;
}

function issued(session = "") {
  const response = NextResponse.json({});
  const token = issueCsrf(response, session);
  const cookie = response.cookies.get(csrfCookie)?.value;
  assert.ok(cookie);
  return { token, cookie };
}

describe("csrf", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = origin;
    process.env.AUTH_CSRF_SECRET = randomBytes(32).toString("hex");
    process.env.AUTH_RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
  });

  it("accepts matching cookie and header", () => {
    const { token, cookie } = issued();
    assert.doesNotThrow(() => requireCsrf(requestWith({ "x-csrf-token": token }, { [csrfCookie]: cookie })));
  });

  it("rejects header mismatch", () => {
    const { cookie } = issued();
    assert.throws(() => requireCsrf(requestWith({ "x-csrf-token": "x".repeat(43) }, { [csrfCookie]: cookie })), /CSRF/);
  });

  it("rejects missing cookie", () => {
    const { token } = issued();
    assert.throws(() => requireCsrf(requestWith({ "x-csrf-token": token })), /CSRF/);
  });

  it("binds token to session cookie", () => {
    const session = randomBytes(32).toString("base64url");
    const { token, cookie } = issued(session);
    assert.doesNotThrow(() => requireCsrf(requestWith({ "x-csrf-token": token }, { [csrfCookie]: cookie, lelang_session: session })));
    assert.throws(() => requireCsrf(requestWith({ "x-csrf-token": token }, { [csrfCookie]: cookie })), /CSRF/);
  });

  it("rejects tampered signature", () => {
    const { token, cookie } = issued();
    const parts = cookie.split(".");
    parts[2] = parts[2].replace(/^./, (char) => (char === "a" ? "b" : "a"));
    assert.throws(() => requireCsrf(requestWith({ "x-csrf-token": token }, { [csrfCookie]: parts.join(".") })), /CSRF/);
  });

  it("rejects foreign origin", () => {
    assert.throws(() => assertOrigin(new Request(origin, { headers: { origin: "https://evil.example" } })), /Origin/);
    assert.throws(() => assertOrigin(new Request(origin, { headers: { origin, "sec-fetch-site": "cross-site" } })), /Origin/);
  });
});
