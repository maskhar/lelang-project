import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createProperty, getProperties } from "@/lib/db";
import { cityProvinceByName } from "@/lib/indonesia-cities";
import { propertyTypes, type Mode, type Property } from "@/lib/properties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const modes = new Set<Mode>(["lelang", "langsung", "terjual"]);
const imageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const maximumValue = Number.MAX_SAFE_INTEGER;
class InputError extends Error {}
function text(form: FormData, key: string, limit: number) {
  const entry = form.get(key);
  if (typeof entry !== "string" || !entry.trim() || entry.trim().length > limit) throw new InputError(key + " wajib diisi, maksimal " + limit + " karakter.");
  return entry.trim();
}
function numeric(form: FormData, key: string, required = false, minimum = 0, maximum = maximumValue) {
  const entry = form.get(key);
  if (entry instanceof File) throw new InputError(key + " harus angka.");
  const raw = (entry ?? "").trim();
  if (!raw) {
    if (required) throw new InputError(key + " wajib diisi.");
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new InputError(key + " harus angka antara " + minimum + " dan " + maximum + ".");
  return value;
}
async function limitedForm(request: Request) {
  const limit = 101 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new InputError("Total upload maksimal 100 MB.");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("Formulir kosong.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new InputError("Total upload maksimal 100 MB."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData(); }
  catch { throw new InputError("Format formulir tidak valid."); }
}
function validImage(bytes: Buffer, type: string) {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}
export async function GET() {
  try { return NextResponse.json({ properties: getProperties() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Load properties failed", error); return NextResponse.json({ error: "Database tidak tersedia." }, { status: 500 }); }
}
export async function POST(request: Request) {
  const savedPaths: string[] = [];
  try {
    const originHeader = request.headers.get("origin");
    const hostHeader = request.headers.get("host");
    if (!originHeader || !hostHeader) return NextResponse.json({ error: "Origin permintaan tidak valid." }, { status: 403 });
    const origin = new URL(originHeader);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (!loopback.has(origin.hostname) || origin.host !== hostHeader) return NextResponse.json({ error: "Dashboard prototype hanya tersedia melalui localhost dengan origin yang sama." }, { status: 403 });
    const form = await limitedForm(request);
    const mode = text(form, "mode", 20) as Mode;
    const type = text(form, "type", 30);
    const city = text(form, "city", 100);
    const province = text(form, "province", 100);
    if (!modes.has(mode)) throw new InputError("Status properti tidak valid.");
    if (!propertyTypes.includes(type)) throw new InputError("Jenis properti tidak valid.");
    if (cityProvinceByName.get(city.toLocaleLowerCase("id-ID")) !== province) throw new InputError("Pilih kota/kabupaten dari daftar agar provinsi sesuai.");
    const input: Omit<Property, "id"> = { mode, type, title: text(form, "title", 120), city: city + ", " + province, land: numeric(form, "land") ?? 0, build: numeric(form, "build") ?? 0, beds: numeric(form, "beds", false, 0, 1000) ?? 0, price: numeric(form, "price", true, 1)!, bid: mode === "lelang" ? numeric(form, "bid") : undefined, bidders: mode === "lelang" ? 0 : undefined, duration: mode === "lelang" ? numeric(form, "duration", true, 1, 8760) : undefined, desc: text(form, "desc", 1000) };
    const images = form.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (images.length > 20) throw new InputError("Maksimal 20 foto per properti.");
    if (images.length) {
      const uploadDir = process.env.PROPERTY_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
      await mkdir(uploadDir, { recursive: true });
      const imageUrls: string[] = [];
      for (const image of images) {
        const extension = imageTypes.get(image.type);
        if (!extension) throw new InputError("Gambar harus JPG, PNG, atau WebP.");
        if (image.size > 5 * 1024 * 1024) throw new InputError("Ukuran tiap gambar maksimal 5 MB.");
        const bytes = Buffer.from(await image.arrayBuffer());
        if (!validImage(bytes, image.type)) throw new InputError("Isi file tidak sesuai format gambar.");
        const filename = randomUUID() + extension;
        const savedPath = path.join(uploadDir, filename);
        await writeFile(savedPath, bytes, { flag: "wx" });
        savedPaths.push(savedPath);
        imageUrls.push("/api/uploads/" + filename);
      }
      input.imageUrls = imageUrls;
      input.imageUrl = imageUrls[0];
    }
    return NextResponse.json({ property: createProperty(input) }, { status: 201 });
  } catch (error) {
    await Promise.all(savedPaths.map((savedPath) => unlink(savedPath).catch(() => {})));
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Save property failed", error);
    return NextResponse.json({ error: "Gagal menyimpan properti. Silakan coba lagi." }, { status: 500 });
  }
}
