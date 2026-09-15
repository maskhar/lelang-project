import { NextRequest, NextResponse } from "next/server";
import { requireCsrf } from "@/server/auth/csrf";
import { authErrorResponse } from "@/server/auth/http";
import { logout } from "@/server/auth/service";
import { sessionCookieName } from "@/server/auth/session";
import { getAuthConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    await logout(request.cookies.get(sessionCookieName)?.value);
    const response = NextResponse.json({ data: { loggedOut: true } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/", maxAge: 0 });
    response.cookies.set("lelang_csrf", "", { httpOnly: true, secure: getAuthConfig().secure, sameSite: "strict", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
