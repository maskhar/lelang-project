import { redirect } from "next/navigation";
import { AuthenticationError, AuthorizationError, getAuthenticatedActor } from "@/server/auth/actor";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let actor;
  try {
    actor = await getAuthenticatedActor();
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) redirect("/login");
    throw error;
  }
  return (
    <main style={{ maxWidth: 540, margin: "80px auto", padding: 24 }}>
      <h1>Akun Anda</h1>
      <p>{actor.name} — {actor.email}</p>
      <p>Hak akses: {actor.roles.join(", ")}</p>
      <p>Login Google aktif. Dashboard prototype belum terhubung ke auth ini.</p>
      <LogoutButton />
    </main>
  );
}
