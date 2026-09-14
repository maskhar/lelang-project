import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!/^[a-f0-9-]{36}.(jpg|png|webp)$/.test(filename)) return new Response("Not found", { status: 404 });
  try {
    const directory = process.env.PROPERTY_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
    const bytes = await readFile(path.join(directory, filename));
    const extension = path.extname(filename);
    return new Response(bytes, { headers: { "Content-Type": extension === ".jpg" ? "image/jpeg" : extension === ".png" ? "image/png" : "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
