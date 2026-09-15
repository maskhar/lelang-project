"use client";
import { use, useEffect, useState } from "react";
import Image from "next/image";
import PropertyForm, { type ListingFormValue } from "@/components/property-form";
import { apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { FormError } from "@/components/form-error";
import { StatusBadge } from "@/components/status-badge";
import ListingReview from "@/components/listing-review";
import PropertyAvailability from "@/components/property-availability";
import styles from "../../dashboard-shell.module.css";

type Media = { id: string; status: string; isCover: boolean; sortOrder: number };
type Revision = { id: string; revisionNumber: number; status: string; title: string; description: string; landAreaM2: number; buildingAreaM2: number; bedroomCount: number; auctionStartsAt: string | null; auctionEndsAt: string | null; listingSnapshot: Pick<ListingFormValue, "city" | "province" | "type" | "askingPrice" | "saleMode"> | null };
type Detail = { property: { id: string; sku: string; version: number; publicationStatus: string; availabilityStatus: string }; revisions: Revision[]; media: Media[]; permissions: { canMarkSold: boolean } };
export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [formKey, setFormKey] = useState(0);
  async function load() { const data = await apiRequest<Detail>("/api/v1/properties/" + id + "/detail", { cache: "no-store" }); setDetail(data); return data; }
  useEffect(() => { const controller = new AbortController(); apiRequest<Detail>("/api/v1/properties/" + id + "/detail", { cache: "no-store", signal: controller.signal }).then(setDetail).catch((reason) => { if (!controller.signal.aborted) setError(reason); }); return () => controller.abort(); }, [id]);
  const revision = detail?.revisions[0];
  const locked = !revision || revision.status === "pending" || detail?.property.publicationStatus === "archived";
  const mediaLocked = locked || !["draft", "revision_required"].includes(revision?.status || "");
  async function save(value: ListingFormValue) {
    if (!detail) return;
    setBusy(true); setError(null);
    try { await apiRequest("/api/v1/properties/" + id, { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version: detail.property.version, listing: value }) }); await load(); setFormKey((current) => current + 1); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files || !detail || busy) return;
    const selected = Array.from(files);
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5242880) || detail.media.filter((item) => item.status !== "deleted").length + selected.length > 20) { setError(new Error("Maksimal 20 foto JPEG/PNG/WebP, 5 MiB per foto.")); return; }
    setBusy(true); setError(null);
    let version = detail.property.version;
    try { for (const [index, file] of selected.entries()) { setProgress("Mengunggah " + (index + 1) + " / " + selected.length + ": " + file.name); const body = new FormData(); body.set("file", file); body.set("version", String(version)); const result = await apiRequest<{ version: number }>("/api/v1/properties/" + id + "/media", { method: "POST", headers: await csrfHeaders(), body }); version = result.version; await load(); } setProgress("Upload selesai. Tunggu worker, lalu muat ulang status foto."); }
    catch (reason) { setError(reason); await load().catch(() => undefined); setProgress("Upload terhenti. Foto yang berhasil tetap tersimpan; pilih hanya foto yang belum masuk untuk melanjutkan."); }
    finally { setBusy(false); }
  }
  async function order(ids: string[]) { if (!detail || busy) return; setBusy(true); setError(null); try { await apiRequest("/api/v1/properties/" + id + "/media/manage", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version: detail.property.version, mediaIds: ids }) }); await load(); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  const media = detail?.media.filter((item) => item.status !== "deleted").sort((left, right) => left.sortOrder - right.sortOrder) || [];
  const initial = revision?.listingSnapshot ? { ...revision.listingSnapshot, sku: detail?.property.sku, title: revision.title, description: revision.description, landAreaM2: revision.landAreaM2, buildingAreaM2: revision.buildingAreaM2, bedroomCount: revision.bedroomCount, auctionStartsAt: revision.auctionStartsAt, auctionEndsAt: revision.auctionEndsAt } : undefined;
  return <><div className={styles.heading}><div><h1>Editor properti</h1><p>{detail ? "Versi " + detail.property.version + " · Revisi " + revision?.revisionNumber : "Memuat…"}</p></div><button disabled={busy} onClick={() => { if (window.confirm("Muat ulang akan mengganti input belum disimpan dengan data server. Lanjutkan?")) void load().then(() => setFormKey((value) => value + 1)).catch(setError); }}>Muat ulang</button></div><FormError error={error} />{detail && revision && <div className={styles.grid}><section className={styles.panel}><StatusBadge kind="publication" value={detail.property.publicationStatus} /><p>Setiap simpan membuat revisi baru. Foto revisi sebelumnya tidak disalin: unggah ulang foto untuk revisi baru sebelum review. Snapshot publik lama tetap tersedia sampai approve.</p>{locked && <p>Konten terkunci saat review atau setelah arsip.</p>}<PropertyForm key={id + ":" + formKey} initial={initial} onSave={save} disabled={locked || busy} /></section><section className={styles.panel}><h2>Foto revisi</h2><label>Tambah foto <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={mediaLocked || busy} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} /></label><p role="status">{progress}</p><div className={styles.grid}>{media.map((item, index) => <article key={item.id}><StatusBadge kind="media" value={item.status} /> {item.isCover && <strong>Sampul</strong>}{item.status === "ready" && <Image src={"/api/v1/staff/media/" + item.id} alt={"Foto properti " + (index + 1)} width={240} height={160} unoptimized style={{ objectFit: "cover", maxWidth: "100%" }} />}<div className={styles.actions}><button disabled={mediaLocked || busy || index === 0} onClick={() => { const ids = media.map((photo) => photo.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void order(ids); }}>Geser ke depan</button><button disabled={mediaLocked || busy} onClick={() => { if (window.confirm("Hapus foto dari revisi draft ini?")) void order(media.filter((photo) => photo.id !== item.id).map((photo) => photo.id)); }}>Hapus foto</button></div></article>)}</div></section><section className={styles.panel}><h2>Pengajuan & review</h2><ListingReview id={id} version={detail.property.version} onChanged={async () => { await load(); }} /></section>{detail.permissions.canMarkSold && detail.property.publicationStatus === "published" && detail.property.availabilityStatus === "available" && <section className={styles.panel}><h2>Status penjualan</h2><PropertyAvailability id={id} version={detail.property.version} onChanged={async () => { await load(); }} /></section>}</div>}</>;
}
