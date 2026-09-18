import path from "node:path";

// Final public storage path for a processed photo: <sku>/<ordinal>-<uuid>.webp.
// The folder follows the SKU at upload time only; a later SKU edit does not move files (object_path in the DB
// stays authoritative). Ordinal is a human-readable hint — propertyMedia.sortOrder is the real order — and the
// uuid suffix keeps names unique even if two uploads race on the same ordinal.
export function mediaObjectPath(sku: string, ordinal: number, uuid: string) {
  const folder = sku.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${folder}/${String(Math.max(1, ordinal)).padStart(2, "0")}-${uuid}.webp`;
}

// The uuid saveQuarantine assigned, so the public name stays traceable to the quarantine upload.
export function quarantineUuid(objectPath: string) {
  return path.parse(objectPath).name;
}
