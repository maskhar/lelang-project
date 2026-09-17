import "server-only";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDatabase } from "@/server/db/client";
import { profiles, userIdentities, userRoles, userSessions } from "@/server/db/schema";
import { hashAuthToken, sessionCookieName, sessionLastSeenThrottleMs } from "@/server/auth/session";

export type Actor = {
  profileId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  roles: Array<"editor" | "admin" | "owner" | "agent" | "buyer">;
};

export class AuthenticationError extends Error {}
export class AuthorizationError extends Error {}
export async function getAuthenticatedActor(options: { allowNoRole?: boolean } = {}): Promise<Actor> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthenticationError("Sesi tidak ditemukan atau telah berakhir.");

  const database = getDatabase();
  const session = await database.select({
    sessionId: userSessions.id,
    lastSeenAt: userSessions.lastSeenAt,
    profile: { id: profiles.id, email: profiles.email, name: profiles.name, avatarUrl: profiles.avatarUrl, status: profiles.status, emailVerifiedAt: profiles.emailVerifiedAt },
  }).from(userSessions)
    .innerJoin(profiles, eq(userSessions.userId, profiles.id))
    .innerJoin(userIdentities, and(eq(userIdentities.userId, profiles.id), eq(userIdentities.provider, "google")))
    .where(and(eq(userSessions.tokenHash, hashAuthToken(token)), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date())))
    .limit(1);
  const profile = session[0]?.profile;

  if (!profile) throw new AuthenticationError("Sesi tidak valid atau telah berakhir.");
  if (profile.status !== "active" || !profile.emailVerifiedAt) throw new AuthorizationError("Akun belum memiliki akses dashboard.");

  const roleRows = await database.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, profile.id));
  const roles = roleRows.map(({ role }) => role);
  if (roles.length === 0 && !options.allowNoRole) throw new AuthorizationError("Akun belum memiliki akses dashboard.");

  const staleBefore = new Date(Date.now() - sessionLastSeenThrottleMs);
  if (session[0].lastSeenAt < staleBefore) {
    await database.update(userSessions).set({ lastSeenAt: new Date() }).where(and(eq(userSessions.id, session[0].sessionId), lt(userSessions.lastSeenAt, staleBefore))).catch(() => undefined);
  }

  return { profileId: profile.id, email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl, roles };
}

export function requireRole(actor: Actor, ...allowedRoles: Actor["roles"][number][]) {
  if (!actor.roles.some((role) => allowedRoles.includes(role))) throw new AuthorizationError("Peran Anda tidak memiliki akses untuk aksi ini.");
  return actor;
}
