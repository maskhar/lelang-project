import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/server/auth/config";
import { issueCsrf } from "@/server/auth/csrf";
import { consumeGoogleTransaction, googleCookieName, verifyGoogleCode } from "@/server/auth/google";
import { AuthHttpError } from "@/server/auth/http";
import { limitGoogleCallback, limitGoogleCallbackByIp } from "@/server/auth/rate-limit";
import { loginWithGoogle } from "@/server/auth/service";
import { clientFingerprint, resolveClientIp, sessionCookieName } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    await limitGoogleCallback();
    await limitGoogleCallbackByIp(resolveClientIp(request));
    const parameters = request.nextUrl.searchParams;
    if (["state", "code", "error"].some((key) => parameters.getAll(key).length > 1)) throw new AuthHttpError(400, "INVALID_CALLBACK", "Callback Google tidak valid.");
    const transaction = await consumeGoogleTransaction(parameters.get("state"), request.cookies.get(googleCookieName)?.value);
    const code = parameters.get("code");
    if (parameters.has("error") || !code || code.length > 4096) throw new AuthHttpError(400, "GOOGLE_LOGIN_CANCELLED", "Login Google dibatalkan. Mulai login kembali.");
    const identity = await verifyGoogleCode(code, transaction);
    const result = await loginWithGoogle(identity, request.cookies.get(sessionCookieName)?.value, clientFingerprint(request));
    const landing = result.roles.length === 0 ? "/access-request" : result.roles.some((role) => role === "editor" || role === "admin") ? "/dashboard?welcome=1" : "/dashboard/account";
    response = NextResponse.redirect(new URL(landing, getAuthConfig().origin));
    response.cookies.set(sessionCookieName, result.token, { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/", expires: result.expiresAt });
    issueCsrf(response, result.token);
  } catch (error) {
    // Callback adalah navigasi browser, bukan panggilan fetch: balasan JSON membuat pengguna
    // terdampar di layar mentah tanpa jalan kembali. Transaksi OAuth sudah dihapus di atas
    // (sekali pakai, demi anti-replay), jadi tombol back hanya menghasilkan INVALID_OAUTH_STATE.
    // Kembalikan ke /login dengan kode error supaya halaman bisa menjelaskan dan menawarkan ulang.
    const failure = error instanceof AuthHttpError ? error : new AuthHttpError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi belum tersedia.");
    console.error(JSON.stringify({ event: "auth.google.callback.failure", code: failure.code, status: failure.status }));
    const destination = new URL("/login", getAuthConfig().origin);
    destination.searchParams.set("error", failure.code);
    response = NextResponse.redirect(destination);
  }
  response.cookies.set(googleCookieName, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/v1/auth/google", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
