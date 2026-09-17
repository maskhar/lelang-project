import "server-only";
import { type Actor } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";

export const isStaff = (actor: Actor) => actor.roles.includes("editor") || actor.roles.includes("admin");
export const isOwnerOnly = (actor: Actor) => actor.roles.includes("owner") && !isStaff(actor);
export const isBuyerOnly = (actor: Actor) => actor.roles.includes("buyer") && !isStaff(actor);
export const isAgentOnly = (actor: Actor) => actor.roles.includes("agent") && !isStaff(actor) && !actor.roles.includes("owner") && !actor.roles.includes("buyer");
export const denied = () => new AuthHttpError(403, "PROPERTY_ACCESS_DENIED", "Anda tidak memiliki akses ke properti ini.");

export function assertListingAccess(actor: Actor, property: { ownerId: string | null }) {
  if (!isStaff(actor) && property.ownerId !== actor.profileId) throw denied();
  return actor;
}
