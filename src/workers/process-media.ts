import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDatabasePool } from "@/server/db/client";
import { promote, readPublic, readQuarantine, verifyImage } from "@/server/storage/local";

export async function processMedia(mediaId: string) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select * from app.property_media where id=$1 for update", [mediaId]);
    const item = rows[0];
    if (!item || item.status !== "pending") { await client.query("commit"); return; }
    let bytes: Buffer;
    try { bytes = await readQuarantine(item.object_path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; bytes = await readPublic(item.object_path); }
    let valid = verifyImage(bytes, item.content_type) && bytes.length === Number(item.size_bytes) && createHash("sha256").update(bytes).digest("hex") === item.checksum_sha256;
    if (valid) {
      try {
        const decoded = await sharp(bytes, { failOn: "error", limitInputPixels: 16_000_000 }).raw().toBuffer({ resolveWithObject: true });
        valid = decoded.info.width > 0 && decoded.info.height > 0;
      } catch { valid = false; }
    }
    if (valid) {
      const logo = await readFile(path.join(process.cwd(), "public/image/logo/white/LP-logo-large-white.png"));
      const image = sharp(bytes, { failOn: "error", limitInputPixels: 16_000_000 });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) valid = false;
      else {
        const watermarkWidth = Math.min(metadata.width, Math.max(160, Math.round(metadata.width * 0.28)));
        const watermark = await sharp(logo).resize({ width: watermarkWidth, height: metadata.height, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        const encoded = await image.composite([{ input: watermark, gravity: "center", blend: "over" }]).webp({ quality: 78, effort: 5 }).toBuffer();
        const quarantinePath = path.join(process.env.STORAGE_ROOT!, "quarantine", item.object_path);
        await writeFile(quarantinePath, encoded);
        await promote(item.object_path);
        await client.query("update app.property_media set status='ready',bucket='public',content_type='image/webp',size_bytes=$2,checksum_sha256=$3,updated_at=now() where id=$1", [mediaId, encoded.length, createHash("sha256").update(encoded).digest("hex")]);
      }
    }
    if (!valid) await client.query("update app.property_media set status='rejected',bucket='quarantine',updated_at=now() where id=$1", [mediaId]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
