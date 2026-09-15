import { createHash } from "node:crypto";
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
    if (valid) await promote(item.object_path);
    await client.query("update app.property_media set status=$2,bucket=$3,updated_at=now() where id=$1", [mediaId, valid ? "ready" : "rejected", valid ? "public" : "quarantine"]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
