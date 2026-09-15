import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { getDatabase } from "@/server/db/client";
import { propertyMedia } from "@/server/db/schema";
import { readPublic } from "@/server/storage/local";
import { identifier } from "@/server/properties/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireRole(await getAuthenticatedActor(), "editor", "admin");
    const id = identifier.parse((await context.params).id);
    const [media] = await getDatabase().select({ id: propertyMedia.id, bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath, contentType: propertyMedia.contentType, status: propertyMedia.status }).from(propertyMedia).where(eq(propertyMedia.id, id));
    if (!media || media.status !== "ready" || media.bucket !== "public") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const bytes = await readPublic(media.objectPath);
    return new NextResponse(bytes, { headers: { "Content-Type": media.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
