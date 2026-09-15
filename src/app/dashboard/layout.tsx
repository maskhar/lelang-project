import { redirect } from "next/navigation";
import { AuthenticationError, AuthorizationError, getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import DashboardShell from "./dashboard-shell";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let actor;
  try { actor = requireRole(await getAuthenticatedActor(), "editor", "admin"); }
  catch (error) {
    if (error instanceof AuthenticationError) redirect("/login");
    if (error instanceof AuthorizationError) return <main><h1>Akses ditolak</h1><p>Akun belum memiliki izin dashboard.</p></main>;
    throw error;
  }
  return <DashboardShell actor={actor}>{children}</DashboardShell>;
}
