import { getAuthenticatedActor } from "@/server/auth/actor";
import AssignmentsView from "./assignments-view";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const actor = await getAuthenticatedActor();
  return <AssignmentsView isAdmin={actor.roles.includes("admin")} />;
}
