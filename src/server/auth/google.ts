import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { oauthTransactions } from "@/server/db/schema";
import { getAuthConfig } from "./config";
import { AuthHttpError } from "./http";
import { createSessionToken, hashAuthToken, hasMatchingToken } from "./session";

export const googleCookieName = "lelang_google";
export const googleDurationSeconds = 600;

function googleClient() {
  const config = z.object({ clientId: z.string().endsWith(".apps.googleusercontent.com"), clientSecret: z.string().min(1) }).safeParse({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  if (!config.success) throw new AuthHttpError(503, "GOOGLE_NOT_CONFIGURED", "Login Google belum dikonfigurasi administrator.");
  const redirectUri = getAuthConfig().origin + "/api/v1/auth/google/callback";
  if (process.env.GOOGLE_REDIRECT_URI !== redirectUri) throw new Error("Google redirect URI must match application origin and callback path.");
  return new OAuth2Client({ clientId: config.data.clientId, clientSecret: config.data.clientSecret, redirectUri, transporterOptions: { timeout: 10_000, retry: false } });
}

export async function startGoogleLogin() {
  const client = googleClient();
  const state = createSessionToken();
  const browser = createSessionToken();
  const nonce = createSessionToken();
  const verifier = createSessionToken();
  const database = getDatabase();
  await database.delete(oauthTransactions).where(lt(oauthTransactions.expiresAt, new Date()));
  await database.insert(oauthTransactions).values({
    stateHash: hashAuthToken(state), browserHash: hashAuthToken(browser), nonceHash: hashAuthToken(nonce), verifierHash: hashAuthToken(verifier),
    expiresAt: new Date(Date.now() + googleDurationSeconds * 1000),
  });
  const url = client.generateAuthUrl({
    scope: ["openid", "email", "profile"], access_type: "online", prompt: "select_account", state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: CodeChallengeMethod.S256,
  });
  const destination = new URL(url);
  destination.searchParams.set("nonce", nonce);
  return { url: destination.toString(), cookie: browser + "." + verifier };
}

export async function consumeGoogleTransaction(state: string | null, cookie?: string) {
  const match = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(cookie || "");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !match) throw new AuthHttpError(400, "INVALID_OAUTH_STATE", "Sesi login tidak valid. Mulai login kembali.");
  const [transaction] = await getDatabase().delete(oauthTransactions).where(and(
    eq(oauthTransactions.stateHash, hashAuthToken(state)), eq(oauthTransactions.browserHash, hashAuthToken(match[1])),
    eq(oauthTransactions.verifierHash, hashAuthToken(match[2])), gt(oauthTransactions.expiresAt, new Date()),
  )).returning({ nonceHash: oauthTransactions.nonceHash });
  if (!transaction) throw new AuthHttpError(400, "INVALID_OAUTH_STATE", "Sesi login telah berakhir atau dipakai. Mulai login kembali.");
  return { nonceHash: transaction.nonceHash, verifier: match[2] };
}

export async function verifyGoogleCode(code: string, transaction: { nonceHash: string; verifier: string }) {
  const client = googleClient();
  try {
    const { tokens } = await client.getToken({ code, codeVerifier: transaction.verifier });
    if (!tokens.id_token) throw new Error("Missing ID token.");
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const parsed = z.object({
      sub: z.string().min(1).max(255), email: z.email().max(320), email_verified: z.literal(true), nonce: z.string(),
      exp: z.number(), iat: z.number(), azp: z.string().optional(), hd: z.string().min(1).optional(),
    }).parse(ticket.getPayload());
    const now = Date.now() / 1000;
    if (!hasMatchingToken(parsed.nonce, transaction.nonceHash) || parsed.exp <= now || parsed.iat > now + 60 || (parsed.azp && parsed.azp !== process.env.GOOGLE_CLIENT_ID)) throw new Error("Invalid claims.");
    const email = parsed.email.toLowerCase();
    return { subject: parsed.sub, email, authoritativeEmail: email.endsWith("@gmail.com") || !!parsed.hd };
  } catch {
    throw new AuthHttpError(401, "GOOGLE_AUTH_FAILED", "Verifikasi Google gagal. Mulai login kembali.");
  }
}
