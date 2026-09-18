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
  // Identitas yang dipakai claims ID token; ditukar ke akun signup pada kasus pendaftaran mandiri.
  const who = { subject, email };
  let profileId: string | undefined;
  const cleanupProfiles: string[] = [];
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
      assert.equal(destination.searchParams.get("scope"), "openid email", "Only minimal OIDC scope requested");
      const cookie = response.cookies.get(google.googleCookieName)!.value;
      expectedVerifier = cookie.split(".")[1];
      assert.equal(destination.searchParams.get("code_challenge"), createHash("sha256").update(expectedVerifier).digest("base64url"));
      const state = destination.searchParams.get("state")!;
      states.push(hashAuthToken(state));
      const now = Math.floor(Date.now() / 1000);
      claims = { iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, azp: process.env.GOOGLE_CLIENT_ID, sub: who.subject, email: who.email, email_verified: true, nonce: destination.searchParams.get("nonce"), iat: now, exp: now + 3600 };
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
    // Pendaftaran mandiri: email gmail yang belum punya profile dibuatkan profile + role buyer.
    const signupEmail = "signup-test-" + randomUUID() + "@gmail.com";
    who.subject = "signup-" + randomUUID();
    who.email = signupEmail;
    const signup = await finish(await prepare());
    assert.equal(signup.status, 307);
    assert.equal(signup.headers.get("location"), origin + "/dashboard/account", "Buyer baru mendarat di halaman akun, bukan /access-request");
    const created = await admin.query("SELECT id, status, name, email_verified_at FROM app.profiles WHERE email = $1", [signupEmail]);
    assert.equal(created.rows.length, 1, "Profile dibuat sekali");
    cleanupProfiles.push(created.rows[0].id);
    assert.equal(created.rows[0].status, "active");
    assert.equal(created.rows[0].name, signupEmail.split("@")[0], "Nama jatuh ke local-part saat claim name kosong");
    assert.ok(created.rows[0].email_verified_at);
    const grantedRoles = await admin.query("SELECT role FROM app.user_roles WHERE user_id = $1", [created.rows[0].id]);
    assert.deepEqual(grantedRoles.rows.map((row: { role: string }) => row.role), ["buyer"], "Role signup hanya buyer");
    // created_at bisa tie antar transaksi; identifikasi baris lewat action, bukan posisi urutan.
    const signupAudit = await admin.query("SELECT action, metadata FROM app.audit_logs WHERE actor_id = $1", [created.rows[0].id]);
    assert.deepEqual(signupAudit.rows.map((row: { action: string }) => row.action).sort(), ["auth.google.login", "auth.google.signup"]);
    assert.deepEqual(signupAudit.rows.find((row: { action: string }) => row.action === "auth.google.signup")?.metadata, { role: "buyer", provider: "google" });
    // Email non-otoritatif (bukan gmail, tanpa hd) tidak boleh memicu pendaftaran mandiri.
    who.subject = "nonauth-" + randomUUID();
    who.email = "nonauth-" + randomUUID() + "@contoh.invalid";
    const nonAuthoritative = await finish(await prepare());
    assert.equal(nonAuthoritative.status, 403, "Email non-otoritatif ditolak");
    assert.equal((await admin.query("SELECT id FROM app.profiles WHERE email = $1", [who.email])).rows.length, 0);
    who.subject = subject;
    who.email = email;
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
    assert.equal(success.headers.get("location"), origin + "/dashboard?welcome=1", "Editor/admin lands on dashboard");
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
    // Profile lama tanpa role tidak mendapat buyer secara surut — itu wewenang admin.
    const zeroRoleEmail = "zero-role-" + randomUUID() + "@gmail.com";
    const zeroRole = await admin.query("INSERT INTO app.profiles (email, name) VALUES ($1, 'Tanpa role') RETURNING id", [zeroRoleEmail]);
    cleanupProfiles.push(zeroRole.rows[0].id);
    const zeroRoleLogin = await loginWithGoogle({ subject: "zero-" + randomUUID(), email: zeroRoleEmail, authoritativeEmail: true });
    assert.deepEqual(zeroRoleLogin.roles, []);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM app.audit_logs WHERE actor_id = $1 AND action = 'auth.google.signup'", [zeroRole.rows[0].id])).rows[0].n, 0);
    await logout(zeroRoleLogin.token);
    // Email non-kanonik (huruf besar) tidak boleh dibuatkan profile — CHECK constraint DB dilindungi lebih awal.
    const upperEmail = "Upper-" + randomUUID() + "@gmail.com";
    await assert.rejects(loginWithGoogle({ subject: "upper-" + randomUUID(), email: upperEmail, authoritativeEmail: true }), expectCode("ACCOUNT_NOT_APPROVED"));
    assert.equal((await admin.query("SELECT id FROM app.profiles WHERE lower(email) = lower($1)", [upperEmail])).rows.length, 0);
    // Kuota signup per-IP: 3/jam. Percobaan ke-4 ditolak dan transaksinya dibatalkan (tidak ada profile).
    const ipHash = "signup-ip-" + randomUUID();
    const signupTokens: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const burstEmail = "burst-" + randomUUID() + "@gmail.com";
      const burst = await loginWithGoogle({ subject: "burst-" + randomUUID(), email: burstEmail, authoritativeEmail: true }, undefined, { ipHash, userAgentHash: null });
      assert.deepEqual(burst.roles, ["buyer"]);
      signupTokens.push(burst.token);
      cleanupProfiles.push((await admin.query("SELECT id FROM app.profiles WHERE email = $1", [burstEmail])).rows[0].id);
    }
    const overflowEmail = "burst-" + randomUUID() + "@gmail.com";
    await assert.rejects(loginWithGoogle({ subject: "burst-" + randomUUID(), email: overflowEmail, authoritativeEmail: true }, undefined, { ipHash, userAgentHash: null }), expectCode("SIGNUP_RATE_LIMITED"));
    assert.equal((await admin.query("SELECT id FROM app.profiles WHERE email = $1", [overflowEmail])).rows.length, 0, "Signup yang dibatasi tidak menyisakan profile");
    for (const burstToken of signupTokens) await logout(burstToken);
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
    console.log("PASS: Google PKCE/state/browser/nonce, signed ID token checks, replay, self-signup buyer, non-authoritative rejection, zero-role no-retroactive-grant, signup rate limit, sub binding, rotation, disabled account, CSRF, logout, rate limit. Google transport mocked; no real OAuth credentials used.");
  } finally {
    OAuth2Client.prototype.getToken = originalToken;
    OAuth2Client.prototype.getFederatedSignonCertsAsync = originalCerts;
    if (profileId) cleanupProfiles.push(profileId);
    if (cleanupProfiles.length) {
      await admin.query("DELETE FROM app.audit_logs WHERE actor_id = ANY($1::uuid[])", [cleanupProfiles]);
      await admin.query("DELETE FROM app.profiles WHERE id = ANY($1::uuid[])", [cleanupProfiles]);
    }
    await admin.query("DELETE FROM app.auth_rate_limits WHERE key_hash IS NOT NULL AND key_hash != ''");
    await admin.query("DELETE FROM app.oauth_transactions WHERE state_hash = ANY($1::varchar[])", [states]);
    await admin.end();
    await getDatabasePool().end();
  }
}

main().catch((error) => { console.error("Google auth test failed. Inspect assertions without exposing credentials."); if (process.env.AUTH_TEST_DEBUG === "1") console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
