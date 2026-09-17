import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { getDatabase } from "@/server/db/client";
import { properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { readPublic } from "@/server/storage/local";
import { identifier } from "@/server/properties/validation";
import { isStaff } from "@/server/properties/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireRole(await getAuthenticatedActor(), "editor", "admin", "owner");
    const id = identifier.parse((await context.params).id);
    const [media] = await getDatabase().select({ id: propertyMedia.id, bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath, contentType: propertyMedia.contentType, status: propertyMedia.status, ownerId: properties.ownerId })
      .from(propertyMedia)
      .innerJoin(propertyRevisions, eq(propertyRevisions.id, propertyMedia.revisionId))
      .innerJoin(properties, eq(properties.id, propertyRevisions.propertyId))
      .where(eq(propertyMedia.id, id));
    if (!media || media.status !== "ready" || media.bucket !== "public") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    if (!isStaff(actor) && media.ownerId !== actor.profileId) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const bytes = await readPublic(media.objectPath);
    return new NextResponse(bytes, { headers: { "Content-Type": media.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
