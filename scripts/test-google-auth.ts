import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { loadEnvFile } from "node:process";
import { OAuth2Client } from "google-auth-library";
import { NextRequest } from "next/server";
import pg from "pg";

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env.migration.local");
  for (const value of [process.env.DATABASE_URL, process.env.DATABASE_MIGRATION_URL]) {
    const target = new URL(value!);
    if (target.hostname !== "127.0.0.1" || target.port !== "15432" || target.pathname !== "/lelang_properti_dev") throw new Error("Tests require local development database.");
  }
  process.env.APP_BASE_URL = "http://localhost:3003";
  process.env.AUTH_RATE_LIMIT_SECRET = randomBytes(32).toString("hex");
  const { AuthHttpError } = await import("../src/server/auth/http");
  const google = await import("../src/server/auth/google");
  const { hashAuthToken } = await import("../src/server/auth/session");
  const { loginWithGoogle, logout } = await import("../src/server/auth/service");
  const { GET: start } = await import("../src/app/api/v1/auth/google/start/route");
  const { GET: callback } = await import("../src/app/api/v1/auth/google/callback/route");
  const { GET: csrf } = await import("../src/app/api/v1/auth/csrf/route");
  const { POST: logoutRoute } = await import("../src/app/api/v1/auth/logout/route");
  const { getDatabasePool } = await import("../src/server/db/client");
  const admin = new pg.Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certificate = publicKey.export({ type: "spki", format: "pem" }).toString();
  const originalToken = OAuth2Client.prototype.getToken;
  const originalCerts = OAuth2Client.prototype.getFederatedSignonCertsAsync;
  let claims: Record<string, unknown> = {};
  let expectedVerifier = "";
  let invalidSignature = false;
  let exchanged = 0;
  const states: string[] = [];
  const subject = "test-" + randomUUID();
  const email = "auth-test-" + randomUUID() + "@gmail.com";
  let profileId: string | undefined;
  const expectCode = (code: string) => (error: unknown) => error instanceof AuthHttpError && error.code === code;
  const origin = process.env.APP_BASE_URL;
  try {
    await admin.connect();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await assert.rejects(google.startGoogleLogin(), expectCode("GOOGLE_NOT_CONFIGURED"));
    process.env.GOOGLE_CLIENT_ID = "test.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-not-real";
    process.env.GOOGLE_REDIRECT_URI = origin + "/wrong";
    await assert.rejects(google.startGoogleLogin());
    process.env.GOOGLE_REDIRECT_URI = origin + "/api/v1/auth/google/callback";
    Object.defineProperty(OAuth2Client.prototype, "getToken", { configurable: true, writable: true, value: async (options: { codeVerifier: string }) => {
      exchanged++;
      assert.equal(options.codeVerifier, expectedVerifier);
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      const unsigned = header + "." + payload;
      const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);
      if (invalidSignature) signature[0] ^= 1;
      return { tokens: { id_token: unsigned + "." + signature.toString("base64url") } };
    } });
    Object.defineProperty(OAuth2Client.prototype, "getFederatedSignonCertsAsync", { configurable: true, writable: true, value: async () => ({ certs: { "test-key": certificate } }) });
    const prepare = async () => {
      const response = await start(new NextRequest(origin + "/api/v1/auth/google/start", { headers: { "Sec-Fetch-Site": "same-origin" } }));
      assert.equal(response.status, 307);
      const destination = new URL(response.headers.get("location")!);
      assert.equal(destination.origin, "https://accounts.google.com");
      assert.equal(destination.searchParams.get("code_challenge_method"), "S256");
      assert.equal(destination.searchParams.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI);
      assert.equal(destination.searchParams.get("scope"), "openid email profile");
      const cookie = response.cookies.get(google.googleCookieName)!.value;
      expectedVerifier = cookie.split(".")[1];
      assert.equal(destination.searchParams.get("code_challenge"), createHash("sha256").update(expectedVerifier).digest("base64url"));
      const state = destination.searchParams.get("state")!;
      states.push(hashAuthToken(state));
      const now = Math.floor(Date.now() / 1000);
      claims = { iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, azp: process.env.GOOGLE_CLIENT_ID, sub: subject, email, email_verified: true, nonce: destination.searchParams.get("nonce"), iat: now, exp: now + 3600 };
      return { state, cookie };
    };
    const finish = (flow: { state: string; cookie: string }, extraCookie = "") => callback(new NextRequest(origin + "/api/v1/auth/google/callback?state=" + flow.state + "&code=test-code", { headers: { Cookie: google.googleCookieName + "=" + flow.cookie + extraCookie } }));

    assert.equal((await start(new NextRequest(origin + "/api/v1/auth/google/start", { headers: { "Sec-Fetch-Site": "cross-site" } }))).status, 403);
    const malformed = await callback(new NextRequest(origin + "/api/v1/auth/google/callback?code=test"));
    assert.equal(malformed.status, 400);
    assert.equal(exchanged, 0);
    const wrongBrowser = await prepare();
    await assert.rejects(google.consumeGoogleTransaction(wrongBrowser.state, randomBytes(32).toString("base64url") + "." + expectedVerifier), expectCode("INVALID_OAUTH_STATE"));
    await admin.query("UPDATE app.oauth_transactions SET expires_at = now() - interval '1 second' WHERE state_hash = $1", [hashAuthToken(wrongBrowser.state)]);
    await assert.rejects(google.consumeGoogleTransaction(wrongBrowser.state, wrongBrowser.cookie), expectCode("INVALID_OAUTH_STATE"));
    const unapproved = await finish(await prepare());
    assert.equal(unapproved.status, 403);
    const inserted = await admin.query("INSERT INTO app.profiles (email, name) VALUES ($1, 'Synthetic Google test') RETURNING id", [email]);
    profileId = inserted.rows[0].id;
    await admin.query("INSERT INTO app.user_roles (user_id, role) VALUES ($1, 'editor')", [profileId]);

    for (const badClaim of [{ nonce: "wrong" }, { aud: "wrong" }, { iss: "https://attacker.invalid" }, { email_verified: false }, { exp: 1 }, { azp: "wrong" }]) {
      const flow = await prepare();
      claims = { ...claims, ...badClaim };
      const response = await finish(flow);
      assert.equal(response.status, 401, JSON.stringify(badClaim));
      assert.equal((await finish(flow)).status, 400, "Callback replay rejected");
    }
    const forged = await prepare();
    invalidSignature = true;
    assert.equal((await finish(forged)).status, 401);
    invalidSignature = false;
    const good = await prepare();
    const success = await finish(good);
    assert.equal(success.status, 307);
    assert.equal(success.headers.get("location"), origin + "/account");
    const session = success.cookies.get("lelang_session")!;
    assert.equal(session.httpOnly, true);
    assert.equal(session.sameSite, "lax");
    assert.equal((await finish(good)).status, 400);
    const identity = await admin.query("SELECT provider_subject FROM app.user_identities WHERE user_id = $1", [profileId]);
    assert.equal(identity.rows[0].provider_subject, subject);
    const changedEmail = await loginWithGoogle({ subject, email: "changed@example.invalid", authoritativeEmail: false }, session.value);
    const old = await admin.query("SELECT revoked_at FROM app.user_sessions WHERE token_hash = $1", [hashAuthToken(session.value)]);
    assert.ok(old.rows[0].revoked_at);
    await assert.rejects(loginWithGoogle({ subject: "other-" + subject, email, authoritativeEmail: true }), expectCode("ACCOUNT_NOT_APPROVED"));
    await admin.query("UPDATE app.profiles SET status = 'disabled' WHERE id = $1", [profileId]);
    await assert.rejects(loginWithGoogle({ subject, email, authoritativeEmail: true }), expectCode("ACCOUNT_NOT_APPROVED"));
    await admin.query("UPDATE app.profiles SET status = 'active' WHERE id = $1", [profileId]);
    const bootstrap = csrf(new NextRequest(origin + "/api/v1/auth/csrf", { headers: { Cookie: "lelang_session=" + changedEmail.token } }));
    const browserCookies = "lelang_session=" + changedEmail.token + "; lelang_csrf=" + bootstrap.cookies.get("lelang_csrf")!.value;
    const headers = { Origin: origin, Cookie: browserCookies, "X-CSRF-Token": bootstrap.headers.get("X-CSRF-Token")! };
    assert.equal((await logoutRoute(new NextRequest(origin + "/api/v1/auth/logout", { method: "POST" }))).status, 403);
    assert.equal((await logoutRoute(new NextRequest(origin + "/api/v1/auth/logout", { method: "POST", headers }))).status, 200);
    await logout(changedEmail.token);
    const revoked = await admin.query("SELECT revoked_at FROM app.user_sessions WHERE token_hash = $1", [hashAuthToken(changedEmail.token)]);
    assert.ok(revoked.rows[0].revoked_at);
    const { limitGoogleCallback } = await import("../src/server/auth/rate-limit");
    let limited = false;
    for (let attempt = 0; attempt < 101; attempt++) {
      try { await limitGoogleCallback(); } catch (error) { assert.ok(expectCode("LOGIN_RATE_LIMITED")(error)); limited = true; break; }
    }
    assert.equal(limited, true);
    console.log("PASS: Google PKCE/state/browser/nonce, signed ID token checks, replay, preapproval, sub binding, rotation, disabled account, CSRF, logout, rate limit. Google transport mocked; no real OAuth credentials used.");
  } finally {
    OAuth2Client.prototype.getToken = originalToken;
    OAuth2Client.prototype.getFederatedSignonCertsAsync = originalCerts;
    if (profileId) {
      await admin.query("DELETE FROM app.audit_logs WHERE actor_id = $1", [profileId]);
      await admin.query("DELETE FROM app.profiles WHERE id = $1", [profileId]);
    }
    await admin.query("DELETE FROM app.oauth_transactions WHERE state_hash = ANY($1::varchar[])", [states]);
    await admin.end();
    await getDatabasePool().end();
  }
}

main().catch(() => { console.error("Google auth test failed. Inspect assertions without exposing credentials."); process.exitCode = 1; });
