import { AuthorizationError, getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import AdminOperations from "./admin-operations";

export default async function AdminPage({ kind }: { kind: "audit" | "outbox" | "users" }) {
  let actorId = "";
  try {
    actorId = requireRole(await getAuthenticatedActor(), "admin").profileId;
  } catch (error) {
    if (error instanceof AuthorizationError) return <section><h1>Akses ditolak</h1><p>Halaman ini hanya untuk administrator.</p></section>;
    throw error;
  }
  return <AdminOperations kind={kind} actorId={actorId} />;
}
