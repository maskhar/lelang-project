import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError, readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getAuthConfig } from "@/server/auth/config";
import { getDatabase } from "@/server/db/client";
import { auditLogs, profiles, userIdentities, userRoles, userSessions } from "@/server/db/schema";
import { sessionCookieName } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const input = z.object({ confirm: z.literal("HAPUS AKUN") }).strict();

export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor({ allowNoRole: true });
    const parsed = input.safeParse(await readAuthJson(request));
    if (!parsed.success) throw new AuthHttpError(422, "CONFIRM_REQUIRED", 'Ketik "HAPUS AKUN" untuk mengonfirmasi penghapusan.');

    await getDatabase().transaction(async (transaction) => {
      const [profile] = await transaction.select({ id: profiles.id, status: profiles.status }).from(profiles).where(eq(profiles.id, actor.profileId)).for("update");
      if (!profile) throw new AuthHttpError(404, "NOT_FOUND", "Akun tidak ditemukan.");
      await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, profile.id), isNull(userSessions.revokedAt)));
      await transaction.delete(userIdentities).where(eq(userIdentities.userId, profile.id));
      await transaction.delete(userRoles).where(eq(userRoles.userId, profile.id));
      await transaction.update(profiles).set({ status: "disabled", name: "Pengguna dihapus", avatarUrl: null, phone: null, emailVerifiedAt: null, updatedAt: new Date() }).where(eq(profiles.id, profile.id));
      await transaction.insert(auditLogs).values({ actorId: profile.id, action: "account.deleted", entityType: "profile", entityId: profile.id, metadata: { selfService: true } });
    });

    const response = NextResponse.json({ data: { deleted: true } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: getAuthConfig().secure, sameSite: "lax", path: "/", maxAge: 0 });
    response.cookies.set("lelang_csrf", "", { httpOnly: true, secure: getAuthConfig().secure, sameSite: "strict", path: "/", maxAge: 0 });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
