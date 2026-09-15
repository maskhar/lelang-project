import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class AuthHttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function authErrorResponse(error: unknown) {
  const failure = error instanceof AuthHttpError ? error : new AuthHttpError(503, "AUTH_UNAVAILABLE", "Layanan autentikasi belum tersedia.");
  const response = NextResponse.json({ error: { code: failure.code, message: failure.message, requestId: randomUUID() } }, {
    status: failure.status,
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
  if (failure.retryAfter) response.headers.set("Retry-After", String(failure.retryAfter));
  return response;
}

export async function readAuthJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AuthHttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthHttpError(400, "INVALID_JSON", "Body JSON wajib diisi.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.length;
      if (total > 8192) {
        await reader.cancel();
        throw new AuthHttpError(413, "BODY_TOO_LARGE", "Body terlalu besar.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthHttpError(400, "INVALID_JSON", "Body JSON tidak valid."); }
}
