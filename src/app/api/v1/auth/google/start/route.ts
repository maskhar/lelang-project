import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/server/auth/config";
import { googleCookieName, googleDurationSeconds, startGoogleLogin } from "@/server/auth/google";
import { AuthHttpError, authErrorResponse } from "@/server/auth/http";
import { limitLoginByIp, limitLoginGlobal } from "@/server/auth/rate-limit";
import { resolveClientIp } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== getAuthConfig().origin)) throw new AuthHttpError(403, "INVALID_ORIGIN", "Mulai login dari halaman aplikasi.");
    await limitLoginGlobal();
    await limitLoginByIp(resolveClientIp(request));
    const result = await startGoogleLogin();
    const response = NextResponse.redirect(result.url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(googleCookieName, result.cookie, { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/api/v1/auth/google", maxAge: googleDurationSeconds });
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
