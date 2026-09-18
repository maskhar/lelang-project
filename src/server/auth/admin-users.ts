import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { auditLogs, profiles, userRoles, userSessions } from "@/server/db/schema";
import { requireRole, type Actor } from "./actor";
import { AuthHttpError } from "./http";

export const manageableRoles = ["editor", "admin", "owner", "agent", "buyer"] as const;
export type ManageableRole = (typeof manageableRoles)[number];

const notFound = () => new AuthHttpError(404, "USER_NOT_FOUND", "Akun tidak ditemukan.");

// Penjaga self-lockout: admin yang memanggil API ini pasti admin aktif, jadi menolak hanya aksi
// destruktif terhadap dirinya sendiri sudah cukup menjamin selalu tersisa >= 1 admin aktif —
// tanpa perlu query hitung admin. Aksi terhadap akun sendiri tetap tersedia lewat CLI
// (scripts/manage-local-user.mjs) yang berjalan dengan kredensial database terpisah.
export function assertNoSelfLockout(actor: Actor, targetId: string, change: { role?: ManageableRole; grant?: boolean; status?: "active" | "disabled" }) {
  if (targetId !== actor.profileId) return;
  const revokesOwnAdmin = change.role === "admin" && change.grant === false;
  const disablesSelf = change.status === "disabled";
  if (revokesOwnAdmin || disablesSelf) throw new AuthHttpError(422, "SELF_LOCKOUT", "Aksi ini akan mengunci akun admin Anda sendiri. Gunakan CLI manage-local-user untuk perubahan pada akun sendiri.");
}

async function revokeSessions(transaction: Pick<ReturnType<typeof getDatabase>, "update">, targetId: string) {
  await transaction.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, targetId), isNull(userSessions.revokedAt)));
}

export async function setRole(actor: Actor, targetId: string, role: ManageableRole, grant: boolean) {
  requireRole(actor, "admin");
  assertNoSelfLockout(actor, targetId, { role, grant });
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [target] = await transaction.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, targetId)).for("update");
    if (!target) throw notFound();
    if (grant) {
      const [inserted] = await transaction.insert(userRoles).values({ userId: targetId, role }).onConflictDoNothing().returning({ role: userRoles.role });
      if (!inserted) throw new AuthHttpError(409, "ROLE_EXISTS", "Akun sudah memiliki role tersebut.");
    } else {
      const removed = await transaction.delete(userRoles).where(and(eq(userRoles.userId, targetId), eq(userRoles.role, role))).returning({ role: userRoles.role });
      if (!removed.length) throw new AuthHttpError(409, "ROLE_NOT_FOUND", "Akun tidak memiliki role tersebut.");
    }
    // Sesi target dicabut agar Actor berikutnya dibangun dari role terbaru (meniru CLI user:role).
    await revokeSessions(transaction, targetId);
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: grant ? "admin.role.granted" : "admin.role.revoked", entityType: "profile", entityId: targetId, metadata: { role } });
    return { id: targetId, role, granted: grant };
  });
}

export async function setAccountStatus(actor: Actor, targetId: string, status: "active" | "disabled") {
  requireRole(actor, "admin");
  assertNoSelfLockout(actor, targetId, { status });
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [target] = await transaction.select({ id: profiles.id, status: profiles.status }).from(profiles).where(eq(profiles.id, targetId)).for("update");
    if (!target) throw notFound();
    if (target.status === status) throw new AuthHttpError(409, "STATUS_UNCHANGED", "Status akun sudah sesuai.");
    await transaction.update(profiles).set({ status, updatedAt: new Date() }).where(eq(profiles.id, targetId));
    if (status === "disabled") await revokeSessions(transaction, targetId);
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: status === "disabled" ? "admin.account.disabled" : "admin.account.enabled", entityType: "profile", entityId: targetId, metadata: { status } });
    return { id: targetId, status };
  });
}
