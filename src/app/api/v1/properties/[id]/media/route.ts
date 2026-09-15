import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError } from "@/server/auth/http";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, outboxEvents, properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { discard, saveQuarantine } from "@/server/storage/local";
import { identifier } from "@/server/properties/validation";
import { limitedMediaForm } from "@/server/media-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let stored: Awaited<ReturnType<typeof saveQuarantine>> | undefined;
  try {
    const actor = requireRole(await getAuthenticatedActor(), "editor", "admin");
    requireCsrf(request);
    const id = identifier.parse((await context.params).id);
    await consumeRateLimit("upload:" + actor.profileId, 60, 3600);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new AuthHttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan multipart/form-data.");
    const form = await limitedMediaForm(request);
    const file = form.get("file");
    const version = Number(form.get("version"));
    if (!(file instanceof File) || form.getAll("file").length !== 1 || !Number.isSafeInteger(version) || version < 1) throw new AuthHttpError(422, "INVALID_MEDIA", "Satu file dan version wajib diisi.");
    stored = await saveQuarantine(file);
    const uploaded = stored;
    const result = await getDatabase().transaction(async (transaction) => {
      const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
      if (!property) throw new AuthHttpError(404, "NOT_FOUND", "Properti tidak ditemukan.");
      if (property.version !== version) throw new AuthHttpError(409, "VERSION_CONFLICT", "Muat ulang properti.");
      if (property.publicationStatus === "archived") throw new AuthHttpError(409, "INVALID_TRANSITION", "Properti diarsipkan.");
      const [revision] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
      if (!revision || !["draft", "revision_required"].includes(revision.status)) throw new AuthHttpError(409, "REVISION_LOCKED", "Buat revisi draft sebelum mengubah foto.");
      const existing = await transaction.select({ id: propertyMedia.id, sortOrder: propertyMedia.sortOrder }).from(propertyMedia).where(and(eq(propertyMedia.revisionId, revision.id), ne(propertyMedia.status, "deleted")));
      if (existing.length >= 20) throw new AuthHttpError(422, "MEDIA_LIMIT", "Maksimal 20 foto per revisi.");
      const [media] = await transaction.insert(propertyMedia).values({ revisionId: revision.id, bucket: "quarantine", ...uploaded, sortOrder: Math.max(-1, ...existing.map((item) => item.sortOrder)) + 1, isCover: existing.length === 0 }).returning({ id: propertyMedia.id, status: propertyMedia.status });
      await transaction.update(properties).set({ version: version + 1, updatedAt: new Date() }).where(eq(properties.id, id));
      await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.media.uploaded", entityType: "property_media", entityId: media.id });
      await transaction.insert(outboxEvents).values({ type: "media.verify", payload: { mediaId: media.id } });
      return { media, version: version + 1 };
    });
    return NextResponse.json({ data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (stored) await discard(stored.objectPath).catch(() => undefined); return apiErrorResponse(error); }
}
