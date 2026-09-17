import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { accessRequests, auditLogs, leads, profiles, properties, propertyAssignments, propertyRevisions, propertyWatchlists, userRoles, userSessions } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await getAuthenticatedActor({ allowNoRole: true });
    const database = getDatabase();
    const [profile] = await database.select({ id: profiles.id, email: profiles.email, name: profiles.name, avatarUrl: profiles.avatarUrl, phone: profiles.phone, status: profiles.status, emailVerifiedAt: profiles.emailVerifiedAt, createdAt: profiles.createdAt, updatedAt: profiles.updatedAt }).from(profiles).where(eq(profiles.id, actor.profileId)).limit(1);
    const roles = await database.select({ role: userRoles.role, createdAt: userRoles.createdAt }).from(userRoles).where(eq(userRoles.userId, actor.profileId));
    const requests = await database.select({ id: accessRequests.id, requestedRole: accessRequests.requestedRole, reason: accessRequests.reason, status: accessRequests.status, reviewNote: accessRequests.reviewNote, reviewedAt: accessRequests.reviewedAt, createdAt: accessRequests.createdAt }).from(accessRequests).where(eq(accessRequests.profileId, actor.profileId)).orderBy(desc(accessRequests.createdAt));
    const ownLeads = await database.select({ id: leads.id, propertyId: leads.propertyId, name: leads.name, email: leads.email, phone: leads.phone, message: leads.message, status: leads.status, consentAt: leads.consentAt, createdAt: leads.createdAt }).from(leads).where(eq(leads.buyerId, actor.profileId)).orderBy(desc(leads.createdAt));
    const watchlist = await database.select({ propertyId: propertyWatchlists.propertyId, createdAt: propertyWatchlists.createdAt }).from(propertyWatchlists).where(eq(propertyWatchlists.buyerId, actor.profileId)).orderBy(desc(propertyWatchlists.createdAt));
    const ownedListings = await database.select({ id: properties.id, sku: properties.sku, slug: properties.slug, publicationStatus: properties.publicationStatus, availabilityStatus: properties.availabilityStatus, askingPrice: properties.askingPrice, title: propertyRevisions.title, createdAt: properties.createdAt }).from(properties).leftJoin(propertyRevisions, eq(propertyRevisions.id, properties.publishedRevisionId)).where(eq(properties.ownerId, actor.profileId)).orderBy(desc(properties.createdAt));
    const assignments = await database.select({ id: propertyAssignments.id, propertyId: propertyAssignments.propertyId, assignedAt: propertyAssignments.assignedAt, unassignedAt: propertyAssignments.unassignedAt, note: propertyAssignments.note }).from(propertyAssignments).where(eq(propertyAssignments.agentId, actor.profileId)).orderBy(desc(propertyAssignments.assignedAt));
    const sessions = await database.select({ id: userSessions.id, createdAt: userSessions.createdAt, lastSeenAt: userSessions.lastSeenAt, expiresAt: userSessions.expiresAt, ipAddress: userSessions.ipAddress }).from(userSessions).where(and(eq(userSessions.userId, actor.profileId), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date()))).orderBy(desc(userSessions.createdAt));

    await database.insert(auditLogs).values({ actorId: actor.profileId, action: "account.exported", entityType: "profile", entityId: actor.profileId });

    const payload = { generatedAt: new Date().toISOString(), profile, roles, accessRequests: requests, leads: ownLeads, watchlist, ownedListings, assignments, activeSessions: sessions };
    return new NextResponse(JSON.stringify(payload, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="data-akun-lelang-properti.json"', "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
