import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError, readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { identifier } from "@/server/properties/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ version: z.number().int().positive(), mediaIds: z.array(z.uuid()).max(20) }).strict().refine((input) => new Set(input.mediaIds).size === input.mediaIds.length);
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireRole(await getAuthenticatedActor(), "editor", "admin");
    requireCsrf(request);
    const id = identifier.parse((await context.params).id);
    const input = inputSchema.parse(await readAuthJson(request));
    const data = await getDatabase().transaction(async (transaction) => {
      const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
      if (!property) throw new AuthHttpError(404, "NOT_FOUND", "Properti tidak ditemukan.");
      if (property.version !== input.version) throw new AuthHttpError(409, "VERSION_CONFLICT", "Muat ulang properti.");
      const [revision] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
      if (!revision || property.publicationStatus === "archived" || !["draft", "revision_required"].includes(revision.status)) throw new AuthHttpError(409, "REVISION_LOCKED", "Foto hanya dapat diubah pada draft.");
      const media = await transaction.select().from(propertyMedia).where(and(eq(propertyMedia.revisionId, revision.id), ne(propertyMedia.status, "deleted"))).for("update");
      if (input.mediaIds.some((mediaId) => !media.some((item) => item.id === mediaId))) throw new AuthHttpError(422, "INVALID_MEDIA", "Foto bukan bagian revisi ini.");
      await transaction.update(propertyMedia).set({ isCover: false }).where(eq(propertyMedia.revisionId, revision.id));
      for (const item of media) {
        const order = input.mediaIds.indexOf(item.id);
        await transaction.update(propertyMedia).set({ ...(order < 0 ? { status: "deleted" as const } : { sortOrder: order, isCover: order === 0 }), updatedAt: new Date() }).where(eq(propertyMedia.id, item.id));
      }
      await transaction.update(properties).set({ version: property.version + 1, updatedAt: new Date() }).where(eq(properties.id, id));
      await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.media.ordered", entityType: "property", entityId: id, metadata: { revisionId: revision.id, mediaIds: input.mediaIds } });
      return { version: property.version + 1, mediaIds: input.mediaIds };
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
