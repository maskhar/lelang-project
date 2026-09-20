import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuthHttpError } from "@/server/auth/http";
import { parseStorageRoot } from "@/server/env";

const imageTypes = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
export const mediaMaxBytes = 5 * 1024 * 1024;
function root() { return parseStorageRoot(process.env.STORAGE_ROOT); }
function filePath(bucket: "quarantine" | "public", objectPath: string) { if (!/^[a-z0-9/_.-]+$/.test(objectPath)) throw new Error("Invalid object path."); const base = path.join(root(), bucket); const resolved = path.resolve(base, objectPath); if (!resolved.startsWith(base + path.sep)) throw new Error("Invalid object path."); return resolved; }
export function verifyImage(bytes: Buffer, contentType: string) { if (bytes.length < 12 || bytes.length > mediaMaxBytes || !imageTypes.has(contentType)) return false; if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff; if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])); return bytes.subarray(0,4).equals(Buffer.from("RIFF")) && bytes.subarray(8,12).equals(Buffer.from("WEBP")); }
export async function saveQuarantine(file: File) { if (!imageTypes.has(file.type) || file.size < 1 || file.size > mediaMaxBytes) throw new AuthHttpError(422,"INVALID_MEDIA","Foto harus JPEG, PNG, atau WebP maksimal 5 MiB."); const bytes=Buffer.from(await file.arrayBuffer()); if(!verifyImage(bytes,file.type)) throw new AuthHttpError(422,"INVALID_MEDIA","Isi foto tidak valid."); const objectPath=new Date().toISOString().slice(0,10).replaceAll("-","/")+"/"+randomUUID()+imageTypes.get(file.type); const destination=filePath("quarantine",objectPath); await mkdir(path.dirname(destination),{recursive:true}); await writeFile(destination,bytes,{flag:"wx"}); return {objectPath,contentType:file.type,sizeBytes:bytes.length,checksumSha256:createHash("sha256").update(bytes).digest("hex")}; }
export async function promote(objectPath:string,destinationObjectPath:string=objectPath){const source=filePath("quarantine",objectPath);const destination=filePath("public",destinationObjectPath);await mkdir(path.dirname(destination),{recursive:true});try { await rename(source,destination); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await readFile(destination); }}
// Dipakai editListing() untuk menurunkan foto "ready" dari revisi lama ke revisi baru tanpa upload ulang:
// duplikasi file fisik (bukan cuma baris DB) supaya hapus salah satu revisi tidak ikut menghapus revisi lain
// (object_path unik per baris, lihat property_media_object_uidx).
export async function copyPublic(objectPath: string, destinationObjectPath: string) { const destination = filePath("public", destinationObjectPath); await mkdir(path.dirname(destination), { recursive: true }); await copyFile(filePath("public", objectPath), destination); }
export async function discard(objectPath:string){await rm(filePath("quarantine",objectPath),{force:true});}
// Setelah file dihapus, folder <sku>/ yang jadi kosong ikut dibersihkan (rmdir non-rekursif gagal diam-diam bila masih berisi).
export async function discardPublic(objectPath:string){const target=filePath("public",objectPath);await rm(target,{force:true});if(path.dirname(target)!==path.join(root(),"public"))await rmdir(path.dirname(target)).catch(()=>undefined);}
export async function readPublic(objectPath:string){return readFile(filePath("public",objectPath));}
export async function readQuarantine(objectPath:string){return readFile(filePath("quarantine",objectPath));}
