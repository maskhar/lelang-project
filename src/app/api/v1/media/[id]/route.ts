import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { readPublic } from "@/server/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let media: { objectPath: string; contentType: string } | undefined;
  try {
    [media] = await getDatabase().select({ objectPath: propertyMedia.objectPath, contentType: propertyMedia.contentType })
      .from(propertyMedia)
      .innerJoin(propertyRevisions, eq(propertyMedia.revisionId, propertyRevisions.id))
      .innerJoin(properties, eq(properties.publishedRevisionId, propertyRevisions.id))
      .where(and(eq(propertyMedia.id, id), eq(propertyMedia.status, "ready"), eq(properties.publicationStatus, "published")));
  } catch {
    console.error(JSON.stringify({ event: "media.lookup.failure", requestId: randomUUID() }));
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
  if (!media) return notFound();
  try {
    return new NextResponse(await readPublic(media.objectPath), {
      headers: { "Content-Type": media.contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(JSON.stringify({ event: "media.object.missing", mediaId: id, requestId: randomUUID() }));
      return notFound();
    }
    console.error(JSON.stringify({ event: "media.read.failure", mediaId: id, requestId: randomUUID() }));
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } });
  }
}
