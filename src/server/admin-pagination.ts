import "server-only";
import { z } from "zod";
import { AuthHttpError } from "./auth/http";

// Skema hanya memeriksa BENTUK parameter (string pendek, angka dalam rentang), bukan nilai yang sah:
// himpunan nilai `status`/`role`/`sort` berbeda per halaman, jadi diputuskan pemanggilnya masing-masing
// (mis. parseUserListQuery untuk /dashboard/users). .strict() tetap menolak parameter yang sama sekali
// tak dikenal supaya salah tulis nama tidak terbaca sebagai "tanpa filter".
const querySchema = z.object({ page: z.literal("1").optional(), limit: z.coerce.number().int().min(10).max(100).default(50), cursor: z.string().max(200).optional(), q: z.string().trim().max(100).optional(), status: z.string().trim().max(40).optional(), role: z.string().trim().max(40).optional(), sort: z.string().trim().max(40).optional() }).strict();
export function adminPage(parameters: URLSearchParams) {
  for (const key of parameters.keys()) if (parameters.getAll(key).length > 1) throw new AuthHttpError(422, "INVALID_QUERY", "Parameter duplikat tidak diizinkan.");
  const input = querySchema.parse(Object.fromEntries(parameters));
  let offset = 0;
  if (input.cursor) {
    try { offset = z.number().int().min(0).max(10_000_000).parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")).offset); }
    catch { throw new AuthHttpError(422, "INVALID_CURSOR", "Cursor tidak valid."); }
  }
  return { ...input, offset };
}
export function adminPageResult<T>(items: T[], limit: number, offset: number, total: number) {
  return { items: items.slice(0, limit), nextCursor: items.length > limit ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString("base64url") : null, total };
}
