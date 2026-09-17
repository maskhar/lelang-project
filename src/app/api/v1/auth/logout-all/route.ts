import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { apiErrorResponse } from "@/server/api";
import { logoutAll } from "@/server/auth/service";
import { sessionCookieName } from "@/server/auth/session";
import { getAuthConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor();
    const revoked = await logoutAll(actor.profileId);
    const { secure } = getAuthConfig();
    const response = NextResponse.json({ data: { loggedOut: true, revoked } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
    response.cookies.set("lelang_csrf", "", { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
