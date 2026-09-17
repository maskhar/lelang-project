import { AuthorizationError, getAuthenticatedActor, requireRole, type Actor } from "@/server/auth/actor";

export default async function RoleGate({ roles, children }: { roles: Actor["roles"]; children: React.ReactNode }) {
  try {
    requireRole(await getAuthenticatedActor(), ...roles);
  } catch (error) {
    if (error instanceof AuthorizationError) return <section><h1>Akses ditolak</h1><p>Peran Anda tidak memiliki akses ke halaman ini.</p></section>;
    throw error;
  }
  return <>{children}</>;
}
