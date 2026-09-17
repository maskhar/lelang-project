import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { profiles, userSessions, userRoles, userIdentities, auditLogs } from "@/server/db/schema";
import { createSessionToken, hashAuthToken, sessionDurationSeconds, sessionMaxActivePerUser } from "./session";
import { AuthHttpError } from "./http";

const invalid = () => new AuthHttpError(403, "ACCOUNT_NOT_APPROVED", "Akun Google belum memiliki akses. Hubungi administrator.");

export async function loginWithGoogle(identity: { subject: string; email: string; name?: string; avatarUrl?: string | null; authoritativeEmail: boolean }, oldToken?: string, fingerprint?: { ipHash: string | null; ipAddress?: string | null; userAgentHash: string | null }) {
  const database = getDatabase();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  let roleNames: Array<"editor" | "admin" | "owner" | "agent" | "buyer"> = [];
  await database.transaction(async (transaction) => {
    const [linked] = await transaction.select().from(userIdentities).where(and(eq(userIdentities.provider, "google"), eq(userIdentities.providerSubject, identity.subject)));
    if (!linked && !identity.authoritativeEmail) throw invalid();
    const [current] = await transaction.select().from(profiles).where(linked ? eq(profiles.id, linked.userId) : eq(profiles.email, identity.email)).for("update");
    if (!current || current.status !== "active") throw invalid();
    const roles = await transaction.select().from(userRoles).where(eq(userRoles.userId, current.id));
    roleNames = roles.map((row) => row.role);
    if (!linked) {
      const [existing] = await transaction.select().from(userIdentities).where(eq(userIdentities.userId, current.id));
      if (existing && existing.providerSubject !== identity.subject) throw invalid();
      if (!existing) await transaction.insert(userIdentities).values({ userId: current.id, providerSubject: identity.subject, email: identity.email });
    }
    await transaction.update(profiles).set({ name: identity.name?.trim() || current.name, avatarUrl: identity.avatarUrl ?? current.avatarUrl, emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(profiles.id, current.id));
    if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
      await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, hashAuthToken(oldToken)), isNull(userSessions.revokedAt)));
    }
    await transaction.insert(userSessions).values({ userId: current.id, tokenHash: hashAuthToken(token), expiresAt, ipHash: fingerprint?.ipHash ?? null, ipAddress: fingerprint?.ipAddress ?? null, userAgentHash: fingerprint?.userAgentHash ?? null });
    const active = await transaction.select({ id: userSessions.id }).from(userSessions).where(and(eq(userSessions.userId, current.id), isNull(userSessions.revokedAt))).orderBy(desc(userSessions.createdAt), desc(userSessions.id));
    const surplus = active.slice(sessionMaxActivePerUser).map((row) => row.id);
    if (surplus.length) await transaction.update(userSessions).set({ revokedAt: new Date() }).where(inArray(userSessions.id, surplus));
    await transaction.insert(auditLogs).values({ actorId: current.id, action: "auth.google.login", entityType: "profile", entityId: current.id });
  });
  return { token, expiresAt, roles: roleNames };
}

export async function logout(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await getDatabase().transaction(async (transaction) => {
    const revoked = await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, hashAuthToken(token)), isNull(userSessions.revokedAt))).returning({ userId: userSessions.userId });
    if (revoked[0]) await transaction.insert(auditLogs).values({ actorId: revoked[0].userId, action: "auth.logout", entityType: "profile", entityId: revoked[0].userId });
  });
}

export async function logoutAll(profileId: string) {
  return getDatabase().transaction(async (transaction) => {
    const revoked = await transaction.update(userSessions).set({ revokedAt: new Date() })
      .where(and(eq(userSessions.userId, profileId), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    await transaction.insert(auditLogs).values({ actorId: profileId, action: "auth.logout_all", entityType: "profile", entityId: profileId, metadata: { revoked: revoked.length } });
    return revoked.length;
  });
}

export async function listActiveSessions(profileId: string, currentToken?: string) {
  const currentHash = currentToken && /^[A-Za-z0-9_-]{43}$/.test(currentToken) ? hashAuthToken(currentToken) : null;
  const rows = await getDatabase().select({ id: userSessions.id, tokenHash: userSessions.tokenHash, ipAddress: userSessions.ipAddress, createdAt: userSessions.createdAt, lastSeenAt: userSessions.lastSeenAt, expiresAt: userSessions.expiresAt })
    .from(userSessions)
    .where(and(eq(userSessions.userId, profileId), isNull(userSessions.revokedAt)))
    .orderBy(desc(userSessions.lastSeenAt))
    .limit(20);
  return rows.map(({ tokenHash, ...session }) => ({ ...session, current: currentHash !== null && tokenHash === currentHash }));
}
