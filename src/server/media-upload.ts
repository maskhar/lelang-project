import "server-only";
import { AuthHttpError } from "@/server/auth/http";

export async function limitedMediaForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthHttpError(400, "EMPTY_BODY", "File wajib diisi.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 5_300_000) { await reader.cancel(); throw new AuthHttpError(413, "BODY_TOO_LARGE", "Foto maksimal 5 MiB."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
  catch { throw new AuthHttpError(422, "INVALID_MEDIA", "Form upload tidak valid."); }
}
