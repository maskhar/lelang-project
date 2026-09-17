import { getAuthenticatedActor } from "@/server/auth/actor";
import ReviewView from "./review-view";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const actor = await getAuthenticatedActor();
  return <ReviewView isAdmin={actor.roles.includes("admin")} />;
}
