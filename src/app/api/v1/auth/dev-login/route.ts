import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthConfig } from "@/server/auth/config";
import { issueCsrf } from "@/server/auth/csrf";
import { devLoginEmail, devLoginRoles, isDevRoleLoginEnabled, type DevLoginRole } from "@/server/auth/dev-login";
import { AuthHttpError, authErrorResponse } from "@/server/auth/http";
import { loginWithGoogle } from "@/server/auth/service";
import { sessionCookieName } from "@/server/auth/session";
import { getDatabase } from "@/server/db/client";
import { profiles, userRoles } from "@/server/db/schema";

// Local-only shortcut used to review the dashboard as any role while building UI.
// Never reachable outside a local dev database; see isDevRoleLoginEnabled().
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isDevRoleLoginEnabled()) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  const role = request.nextUrl.searchParams.get("role") as DevLoginRole | null;
  if (!role || !devLoginRoles.includes(role)) return NextResponse.json({ error: { code: "INVALID_ROLE", message: "Role tidak dikenal." } }, { status: 400 });

  let response: NextResponse;
  try {
    const email = devLoginEmail(role);
    const database = getDatabase();
    const [existing] = await database.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
    if (!existing) throw new AuthHttpError(503, "DEV_LOGIN_NOT_SEEDED", "Akun dev belum ada. Jalankan `npm run dev:seed-roles` sekali di terminal.");
    await database.insert(userRoles).values({ userId: existing.id, role }).onConflictDoNothing();

    const identity = { subject: "dev:" + role, email, name: "Dev " + role, authoritativeEmail: true };
    const result = await loginWithGoogle(identity);
    const landing = result.roles.some((r) => r === "editor" || r === "admin") ? "/dashboard?welcome=1" : "/dashboard/account";
    response = NextResponse.redirect(new URL(landing, getAuthConfig().origin));
    response.cookies.set(sessionCookieName, result.token, { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/", expires: result.expiresAt });
    issueCsrf(response, result.token);
  } catch (error) {
    response = authErrorResponse(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
