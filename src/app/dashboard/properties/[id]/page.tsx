"use client";
import { use, useEffect, useState, type DragEvent } from "react";
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
type Revision = { id: string; revisionNumber: number; status: string; title: string; description: string; address: string | null; landAreaM2: number; buildingAreaM2: number; bedroomCount: number; auctionStartsAt: string | null; auctionEndsAt: string | null; listingSnapshot: Pick<ListingFormValue, "city" | "province" | "type" | "askingPrice" | "saleMode"> & Partial<Pick<ListingFormValue, "address" | "latitude" | "longitude">> | null };
type Detail = { property: { id: string; sku: string; version: number; publicationStatus: string; availabilityStatus: string }; revisions: Revision[]; media: Media[]; permissions: { canMarkSold: boolean } };
export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [retryFiles, setRetryFiles] = useState<File[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  async function load() { const data = await apiRequest<Detail>("/api/v1/properties/" + id + "/detail", { cache: "no-store" }); setDetail(data); return data; }
  useEffect(() => { const controller = new AbortController(); apiRequest<Detail>("/api/v1/properties/" + id + "/detail", { cache: "no-store", signal: controller.signal }).then(setDetail).catch((reason) => { if (!controller.signal.aborted) setError(reason); }); return () => controller.abort(); }, [id]);
  useEffect(() => { const controller = new AbortController(); apiRequest<{ roles?: string[] }>("/api/v1/auth/session", { cache: "no-store", signal: controller.signal }).then((session) => { if (!controller.signal.aborted) setIsAdmin(Boolean(session.roles?.includes("admin"))); }).catch(() => undefined); return () => controller.abort(); }, []);
  const revision = detail?.revisions[0];
  const locked = !revision || revision.status === "pending" || detail?.property.publicationStatus === "archived";
  const mediaLocked = locked || !["draft", "revision_required"].includes(revision?.status || "");
  async function save(value: ListingFormValue) {
    if (!detail) return;
    setBusy(true); setError(null);
    try { await apiRequest("/api/v1/properties/" + id, { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version: detail.property.version, listing: value }) }); await load(); setFormKey((current) => current + 1); }
    finally { setBusy(false); }
  }
  async function upload(selected: File[]) {
    if (!selected.length || !detail || busy) return;
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5242880) || detail.media.filter((item) => item.status !== "deleted").length + selected.length > 20) { setError(new Error("Maksimal 20 foto JPEG/PNG/WebP, 5 MiB per foto.")); return; }
    setBusy(true); setError(null);
    let version = detail.property.version;
    let uploadedCount = 0;
    try { for (const [index, file] of selected.entries()) { setProgress("Mengunggah " + (index + 1) + " / " + selected.length + ": " + file.name); const body = new FormData(); body.set("file", file); body.set("version", String(version)); const result = await apiRequest<{ version: number }>("/api/v1/properties/" + id + "/media", { method: "POST", headers: await csrfHeaders(), body }); version = result.version; uploadedCount = index + 1; await load(); } setRetryFiles([]); setProgress("Upload selesai. Tunggu worker, lalu muat ulang status foto."); }
    catch (reason) { const remaining = selected.slice(uploadedCount); setRetryFiles(remaining); setError(reason); await load().catch(() => undefined); setProgress("Upload terhenti. " + uploadedCount + " file berhasil; " + remaining.length + " file siap dicoba ulang pada draft yang sama."); }
    finally { setBusy(false); }
  }
  async function order(ids: string[]) { if (!detail || busy) return; setBusy(true); setError(null); try { await apiRequest("/api/v1/properties/" + id + "/media/manage", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version: detail.property.version, mediaIds: ids }) }); await load(); } catch (reason) { setError(reason); } finally { setBusy(false); } }
  function handleFileDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); if (mediaLocked || busy) return; const files = Array.from(event.dataTransfer.files); void upload(files); }
  function handleMediaDrop(event: DragEvent<HTMLElement>, targetId: string) { event.preventDefault(); const sourceId = draggedMediaId; setDraggedMediaId(null); if (!sourceId || sourceId === targetId || mediaLocked || busy) return; const ids = media.map((photo) => photo.id); const sourceIndex = ids.indexOf(sourceId); const targetIndex = ids.indexOf(targetId); if (sourceIndex < 0 || targetIndex < 0) return; ids.splice(sourceIndex, 1); ids.splice(targetIndex, 0, sourceId); void order(ids); }
  const media = detail?.media.filter((item) => item.status !== "deleted").sort((left, right) => left.sortOrder - right.sortOrder) || [];
  const initial = revision?.listingSnapshot ? { ...revision.listingSnapshot, address: revision.address ?? revision.listingSnapshot.address ?? "", latitude: revision.listingSnapshot.latitude ?? null, longitude: revision.listingSnapshot.longitude ?? null, sku: detail?.property.sku, title: revision.title, description: revision.description, landAreaM2: revision.landAreaM2, buildingAreaM2: revision.buildingAreaM2, bedroomCount: revision.bedroomCount, auctionStartsAt: revision.auctionStartsAt, auctionEndsAt: revision.auctionEndsAt } : undefined;
  const mediaLabels: Record<string, string> = { pending: "Menunggu verifikasi", ready: "Siap", rejected: "Ditolak" };
  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Editor properti</h1>
          <p>{detail ? <>SKU <span className={styles.sku}>{detail.property.sku}</span> · Versi {detail.property.version} · Revisi {revision?.revisionNumber}</> : "Memuat…"}</p>
        </div>
        <div className={styles.actions}>
          {detail && <StatusBadge kind="publication" value={detail.property.publicationStatus} />}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Muat ulang akan mengganti input belum disimpan dengan data server. Lanjutkan?")) void load().then(() => setFormKey((value) => value + 1)).catch(setError); }}>Muat ulang</button>
        </div>
      </div>
      <FormError error={error} />
      {!detail && <div className={styles.panel}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>}
      {detail && revision && (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><h2>Data listing</h2>{locked && <span className={styles.badge} data-status="pending">Terkunci</span>}</div>
            <p>Setiap simpan membuat revisi baru. Foto revisi sebelumnya tidak disalin — unggah ulang sebelum review. Snapshot publik lama tetap tampil sampai disetujui.</p>
            <PropertyForm key={id + ":" + formKey} initial={initial} onSave={save} disabled={locked || busy} statusActions={<><ListingReview id={id} version={detail.property.version} isAdmin={isAdmin} onChanged={async () => { await load(); }} />{detail.permissions.canMarkSold && detail.property.publicationStatus === "published" && detail.property.availabilityStatus === "available" && <PropertyAvailability id={id} version={detail.property.version} onChanged={async () => { await load(); }} />}</>} />
          </section>


          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>Foto revisi <span className={styles.meta}>({media.length}/20)</span></h2>
              {retryFiles.length > 0 && (
                <div className={styles.actions}>
                  <button type="button" className={styles.gold} disabled={mediaLocked || busy} onClick={() => void upload(retryFiles)}>Coba ulang {retryFiles.length} file</button>
                  <button type="button" disabled={busy} onClick={() => { setRetryFiles([]); setProgress("Antrean retry dibatalkan. Foto yang sudah berhasil tetap tersimpan."); }}>Batalkan</button>
                </div>
              )}
            </div>
            <label className={styles.uploadZone} onDragOver={(event) => event.preventDefault()} onDrop={handleFileDrop}>
              <strong>Tambah foto</strong>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={mediaLocked || busy} onChange={(event) => { void upload(Array.from(event.target.files || [])); event.target.value = ""; }} />
              <p>JPEG, PNG, atau WebP · maks 5 MiB per foto · maks 20 foto per revisi. Foto pertama otomatis jadi sampul.</p>
            </label>
            {progress && <p role="status" className={styles.notice}>{progress}</p>}
            {media.length === 0 ? <p className={styles.empty}>Belum ada foto pada revisi ini.</p> : (
              <div className={styles.mediaGrid}>
                {media.map((item, index) => (
                  <article key={item.id} className={styles.mediaCard} draggable={!mediaLocked && !busy} onDragStart={() => setDraggedMediaId(item.id)} onDragEnd={() => setDraggedMediaId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleMediaDrop(event, item.id)} data-dragging={draggedMediaId === item.id ? "true" : undefined}>
                    <div className={styles.mediaThumb}>
                      {!mediaLocked && <button type="button" className={styles.mediaDelete} disabled={busy} aria-label="Hapus foto" title="Hapus foto" onClick={() => { if (window.confirm("Hapus foto dari revisi draft ini?")) void order(media.filter((photo) => photo.id !== item.id).map((photo) => photo.id)); }}>🗑</button>}
                      {item.status === "ready"
                        ? <Image src={"/api/v1/staff/media/" + item.id} alt={"Foto properti " + (index + 1)} width={320} height={240} unoptimized />
                        : <div className={styles.mediaThumbEmpty}>{mediaLabels[item.status] ?? item.status}</div>}
                      <div className={styles.mediaBadges}>
                        <span className={styles.badge} data-status={item.status}>{mediaLabels[item.status] ?? item.status}</span>
                        {item.isCover && <span className={styles.coverTag}>Sampul</span>}
                      </div>
                    </div>
                    <div className={styles.mediaActions}>
                      <button type="button" disabled={mediaLocked || busy || index === 0} title="Geser ke depan" onClick={() => { const ids = media.map((photo) => photo.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void order(ids); }}>← Maju</button>
                      <button type="button" disabled={mediaLocked || busy || index === media.length - 1} title="Geser ke belakang" onClick={() => { const ids = media.map((photo) => photo.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; void order(ids); }}>Mundur →</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}