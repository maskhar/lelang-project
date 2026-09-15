import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { profiles, userSessions, userRoles, userIdentities, auditLogs } from "@/server/db/schema";
import { createSessionToken, hashAuthToken, sessionDurationSeconds } from "./session";
import { AuthHttpError } from "./http";

const invalid = () => new AuthHttpError(403, "ACCOUNT_NOT_APPROVED", "Akun Google belum memiliki akses. Hubungi administrator.");

export async function loginWithGoogle(identity: { subject: string; email: string; authoritativeEmail: boolean }, oldToken?: string) {
  const database = getDatabase();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  await database.transaction(async (transaction) => {
    const [linked] = await transaction.select().from(userIdentities).where(and(eq(userIdentities.provider, "google"), eq(userIdentities.providerSubject, identity.subject)));
    if (!linked && !identity.authoritativeEmail) throw invalid();
    const [current] = await transaction.select().from(profiles).where(linked ? eq(profiles.id, linked.userId) : eq(profiles.email, identity.email)).for("update");
    if (!current || current.status !== "active") throw invalid();
    const roles = await transaction.select().from(userRoles).where(eq(userRoles.userId, current.id));
    if (roles.length === 0) throw invalid();
    if (!linked) {
      const [existing] = await transaction.select().from(userIdentities).where(eq(userIdentities.userId, current.id));
      if (existing && existing.providerSubject !== identity.subject) throw invalid();
      if (!existing) await transaction.insert(userIdentities).values({ userId: current.id, providerSubject: identity.subject, email: identity.email });
    }
    await transaction.update(profiles).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(profiles.id, current.id));
    if (oldToken && /^[A-Za-z0-9_-]{43}$/.test(oldToken)) {
      await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, hashAuthToken(oldToken)), isNull(userSessions.revokedAt)));
    }
    await transaction.insert(userSessions).values({ userId: current.id, tokenHash: hashAuthToken(token), expiresAt });
    await transaction.insert(auditLogs).values({ actorId: current.id, action: "auth.google.login", entityType: "profile", entityId: current.id });
  });
  return { token, expiresAt };
}

export async function logout(token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  await getDatabase().transaction(async (transaction) => {
    const revoked = await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.tokenHash, hashAuthToken(token)), isNull(userSessions.revokedAt))).returning({ userId: userSessions.userId });
    if (revoked[0]) await transaction.insert(auditLogs).values({ actorId: revoked[0].userId, action: "auth.logout", entityType: "profile", entityId: revoked[0].userId });
  });
}
