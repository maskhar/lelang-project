import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/server/auth/config";
import { issueCsrf } from "@/server/auth/csrf";
import { consumeGoogleTransaction, googleCookieName, verifyGoogleCode } from "@/server/auth/google";
import { AuthHttpError, authErrorResponse } from "@/server/auth/http";
import { limitGoogleCallback } from "@/server/auth/rate-limit";
import { loginWithGoogle } from "@/server/auth/service";
import { sessionCookieName } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let response: NextResponse;
  try {
    await limitGoogleCallback();
    const parameters = request.nextUrl.searchParams;
    if (["state", "code", "error"].some((key) => parameters.getAll(key).length > 1)) throw new AuthHttpError(400, "INVALID_CALLBACK", "Callback Google tidak valid.");
    const transaction = await consumeGoogleTransaction(parameters.get("state"), request.cookies.get(googleCookieName)?.value);
    const code = parameters.get("code");
    if (parameters.has("error") || !code || code.length > 4096) throw new AuthHttpError(400, "GOOGLE_LOGIN_CANCELLED", "Login Google dibatalkan. Mulai login kembali.");
    const identity = await verifyGoogleCode(code, transaction);
    const result = await loginWithGoogle(identity, request.cookies.get(sessionCookieName)?.value);
    response = NextResponse.redirect(new URL("/account", getAuthConfig().origin));
    response.cookies.set(sessionCookieName, result.token, { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/", expires: result.expiresAt });
    issueCsrf(response, result.token);
  } catch (error) {
    response = authErrorResponse(error);
  }
  response.cookies.set(googleCookieName, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/v1/auth/google", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
