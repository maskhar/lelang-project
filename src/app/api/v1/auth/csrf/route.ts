import { NextRequest, NextResponse } from "next/server";
import { issueCsrf } from "@/server/auth/csrf";
import { AuthHttpError, authErrorResponse } from "@/server/auth/http";
import { sessionCookieName } from "@/server/auth/session";
import { getAuthConfig } from "@/server/auth/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== getAuthConfig().origin)) {
      throw new AuthHttpError(403, "INVALID_ORIGIN", "Origin permintaan tidak valid.");
    }
    const response = NextResponse.json({ data: { csrfHeader: "X-CSRF-Token" } }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
    response.headers.set("X-CSRF-Token", issueCsrf(response, request.cookies.get(sessionCookieName)?.value));
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
