"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { StatusBadge } from "@/components/status-badge";
import { formatBytes } from "@/lib/bytes";
import { formatWib } from "@/lib/datetime";
import styles from "../dashboard-shell.module.css";

type Row = {
  id: string; bucket: string; objectPath: string; contentType: string; sizeBytes: number; status: string;
  isCover: boolean; createdAt: string; propertyId: string; slug: string; sku: string; title: string;
  revisionNumber: number; publishedRevision: boolean;
};
type Page = { items: Row[]; nextCursor: string | null; total: number };
type Stats = {
  files: number; bytes: number; usedFiles: number; usedBytes: number; unusedFiles: number; unusedBytes: number;
  deletedFiles: number; deletedBytes: number; uniqueFiles: number; diskFiles: number; diskBytes: number;
  byStatus: Array<{ status: string; count: number; bytes: number }>;
  byType: Array<{ contentType: string; count: number; bytes: number }>;
};
type OrphanFile = { bucket: string; objectPath: string; sizeBytes: number; modifiedAt: string; mediaId: string | null; status: string | null };
type MissingFile = { mediaId: string; bucket: string; objectPath: string };
type OrphanClass<T> = { count: number; bytes: number; sample: T[]; sampleTruncated: boolean };
type Scan = {
  tanpaBaris: OrphanClass<OrphanFile>; menungguWorker: OrphanClass<OrphanFile>;
  sisaQuarantine: OrphanClass<OrphanFile>; fileHilang: OrphanClass<MissingFile>;
  scannedAt: string; scannedFiles: number; scannedRows: number; truncated: boolean;
};

const filterOptions = [
  // "Semua" sengaja ikut memuat baris berstatus deleted, jadi totalnya lebih besar dari kartu Total file
  // (kartu itu tidak menghitung deleted). Labelnya menyebut itu supaya selisihnya tidak terbaca sebagai bug.
  { value: "", label: "Semua baris (termasuk dihapus)" },
  { value: "terpakai", label: "Terpakai di revisi terbit" },
  { value: "tidak_terpakai", label: "Tidak terpakai" },
  { value: "ready", label: "Status: ready" },
  { value: "pending", label: "Status: pending" },
  { value: "rejected", label: "Status: rejected" },
  { value: "deleted", label: "Status: deleted" },
];
const count = new Intl.NumberFormat("id-ID");

export default function MediaLibrary() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanning, setScanning] = useState(false);
  // Path yang sedang menunggu konfirmasi "HAPUS", plus isi input-nya.
  const [pending, setPending] = useState<OrphanFile | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const mutationLock = useRef(false);

  const endpoint = useCallback((cursor?: string) => {
    const parameters = new URLSearchParams({ page: "1", limit: "50" });
    if (query.trim()) parameters.set("q", query.trim());
    if (filter) parameters.set("status", filter);
    if (cursor) parameters.set("cursor", cursor);
    return "/api/v1/admin/media?" + parameters;
  }, [query, filter]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError(null);
      apiRequest<Page>(endpoint(), { cache: "no-store", signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted) { setRows(page.items); setNextCursor(page.nextCursor); setTotal(page.total); } })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error("Gagal memuat daftar media.")); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [endpoint, refresh]);

  // Statistik tidak ikut debounce pencarian: agregatnya selalu untuk seluruh tabel, bukan hasil filter.
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Stats>("/api/v1/admin/media/stats", { cache: "no-store", signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setStats(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError(null);
    try { const page = await apiRequest<Page>(endpoint(nextCursor), { cache: "no-store" }); setRows((current) => [...current, ...page.items]); setNextCursor(page.nextCursor); setTotal(page.total); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal memuat halaman berikutnya.")); }
    finally { setLoadingMore(false); }
  }

  async function runScan() {
    if (scanning) return;
    setScanning(true); setError(null); setNotice(""); setPending(null);
    try { setScan(await apiRequest<Scan>("/api/v1/admin/media/orphans", { cache: "no-store" })); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal menjalankan scan.")); }
    finally { setScanning(false); }
  }

  async function purge(file: OrphanFile) {
    if (mutationLock.current) return;
    mutationLock.current = true; setError(null); setNotice("");
    try {
      await apiRequest("/api/v1/admin/media/orphans", { method: "DELETE", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ bucket: file.bucket, objectPath: file.objectPath, confirm: confirmText }) });
      setNotice("File dihapus: " + file.objectPath + ". Jalankan scan ulang untuk memperbarui laporan.");
      setPending(null); setConfirmText("");
      // Baris yang sudah dihapus dikeluarkan dari laporan di tempat, supaya tombolnya tidak bisa diklik dua kali.
      setScan((current) => current && { ...current, tanpaBaris: { ...current.tanpaBaris, count: current.tanpaBaris.count - 1, bytes: current.tanpaBaris.bytes - file.sizeBytes, sample: current.tanpaBaris.sample.filter((item) => item.objectPath !== file.objectPath || item.bucket !== file.bucket) } });
    }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal menghapus file.")); }
    finally { mutationLock.current = false; }
  }

  const denied = error instanceof ApiClientError && (error.status === 401 || error.status === 403);
  return <>
    <div className={styles.heading}>
      <div>
        <h1>Media library</h1>
        <p>Semua file yang tersimpan di server beserta pemakaian penyimpanannya. Jalankan scan orphan untuk menemukan file yang tidak terpetakan ke properti mana pun.</p>
      </div>
      <div className={styles.actions}><button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Muat ulang</button></div>
    </div>

    {stats && <div className={styles.stats}>
      <div className={styles.stat}><span>Baris tercatat</span><strong>{count.format(stats.files)}</strong><small>{formatBytes(stats.bytes)} bila tiap baris file sendiri</small></div>
      <div className={styles.stat} data-tone="green"><span>Nyata di disk</span><strong>{count.format(stats.diskFiles)}</strong><small>{formatBytes(stats.diskBytes)} · file fisik sesungguhnya</small></div>
      <div className={styles.stat} data-tone="gold"><span>Tidak terpakai</span><strong>{count.format(stats.unusedFiles)}</strong><small>{formatBytes(stats.unusedBytes)} · baris di draft/revisi lama</small></div>
      <div className={styles.stat}><span>Konten unik</span><strong>{count.format(stats.uniqueFiles)}</strong><small>hasil dedup checksum — isi gambar yang benar-benar berbeda</small></div>
    </div>}

    {/* Kartu "Baris tercatat" dan "Nyata di disk" memang berbeda dan keduanya benar: satu file dipakai banyak
        revisi sekaligus, jadi menjumlah size_bytes per baris menghitung file yang sama berulang kali. */}
    {stats && stats.files > stats.diskFiles && <p><small>Setiap kali properti diedit, revisi barunya memakai <strong>file yang sama</strong>, bukan salinan. Itu sebabnya {count.format(stats.files)} baris hanya memakan {count.format(stats.diskFiles)} file ({formatBytes(stats.diskBytes)}) di disk. Baris yang tidak menempel di revisi terbit pun tidak memakan tempat tambahan, jadi bukan orphan.</small></p>}

    <section className={styles.panel} aria-busy={loading || loadingMore}>
      <div className={styles.panelHead}><h2>Daftar file</h2></div>
      <div className={styles.filters}>
        <label>Cari <input type="search" maxLength={100} placeholder="SKU, judul, atau path" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Tampilkan <select value={filter} onChange={(event) => setFilter(event.target.value)}>{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      {error && <div role="alert" className={styles.error}>{error.message}{error instanceof ApiClientError && error.status === 401 && <> <Link href="/login">Login kembali</Link></>}</div>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading ? <p className={styles.empty}>Memuat data…</p> : !denied && (!rows.length ? <p className={styles.empty}>Tidak ada file yang cocok.</p> : <>
        <p>Menampilkan {rows.length} dari {count.format(total)} file.</p>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Pratinjau</th><th>Properti</th><th>Jenis</th><th>Ukuran</th><th>Status</th><th>Revisi</th><th>Diunggah</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}>
            <td data-label="Pratinjau">{row.status === "ready" && row.contentType.startsWith("image/")
              ? <Image src={"/api/v1/staff/media/" + row.id} alt={"Pratinjau " + row.objectPath} width={96} height={72} unoptimized style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6 }} />
              : <span className={styles.meta}>Tidak ada pratinjau</span>}</td>
            <td data-label="Properti"><div className={styles.propTitle}><Link href={"/dashboard/properties/" + row.propertyId}><strong>{row.title}</strong></Link><span className={styles.sku}>{row.sku}</span><small>{row.objectPath}</small></div></td>
            <td data-label="Jenis">{row.contentType}</td>
            <td data-label="Ukuran"><span className={styles.price}>{formatBytes(row.sizeBytes)}</span></td>
            <td data-label="Status"><StatusBadge kind="media" value={row.status} />{row.isCover && <><br /><small>Foto utama</small></>}</td>
            <td data-label="Revisi">#{row.revisionNumber}<br /><small>{row.publishedRevision ? "Revisi terbit" : "Tidak terpakai"}</small></td>
            <td data-label="Diunggah"><span className={styles.meta}>{formatWib(row.createdAt)}</span></td>
          </tr>)}</tbody>
        </table></div>
        {nextCursor && <div className={styles.actions}><button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Memuat…" : "Muat lebih banyak"}</button></div>}
      </>)}
    </section>

    <section className={styles.panel} aria-busy={scanning}>
      <div className={styles.panelHead}><h2>Scan orphan</h2><button type="button" className={styles.primary} disabled={scanning} onClick={() => void runScan()}>{scanning ? "Memindai…" : "Jalankan scan"}</button></div>
      <p><small>Scan membandingkan isi disk dengan tabel media baris per baris. Batas 6 kali per 5 menit.</small></p>
      {!scan ? <p className={styles.empty}>Belum ada hasil scan. Klik &ldquo;Jalankan scan&rdquo; untuk memeriksa {count.format(stats?.files ?? 0)} file di disk.</p> : <>
        <p>Dipindai {formatWib(scan.scannedAt)} — {count.format(scan.scannedFiles)} file di disk dibanding {count.format(scan.scannedRows)} baris media.{scan.truncated && " Hasil dipotong karena jumlah file melampaui batas scan."}</p>
        {scan.tanpaBaris.count + scan.menungguWorker.count + scan.sisaQuarantine.count + scan.fileHilang.count === 0
          ? <p className={styles.empty}>Tidak ada file orphan. Isi disk cocok persis dengan database.</p>
          : <>
            {scan.tanpaBaris.count > 0 && <div>
              <h3>Tanpa baris database — {count.format(scan.tanpaBaris.count)} file · {formatBytes(scan.tanpaBaris.bytes)}</h3>
              <p><small>File ini tidak dimiliki baris media mana pun: sisa upload yang gagal di tengah atau penghapusan properti yang tidak tuntas. Aman dihapus.</small></p>
              {pending && <div className={styles.confirmBox} role="alertdialog" aria-label="Konfirmasi hapus file orphan">
                <p>Hapus <strong>{pending.bucket}/{pending.objectPath}</strong> ({formatBytes(pending.sizeBytes)}) secara permanen? File tidak bisa dipulihkan.</p>
                <label>Ketik HAPUS <input type="text" value={confirmText} autoComplete="off" onChange={(event) => setConfirmText(event.target.value)} /></label>
                <div className={styles.actions}>
                  <button type="button" className={styles.dangerBtn} disabled={confirmText !== "HAPUS"} onClick={() => void purge(pending)}>Hapus permanen</button>
                  <button type="button" onClick={() => { setPending(null); setConfirmText(""); }}>Batal</button>
                </div>
              </div>}
              <div className={styles.tableWrap}><table className={styles.table}>
                <thead><tr><th>Path</th><th>Ukuran</th><th>Diubah</th><th>Aksi</th></tr></thead>
                <tbody>{scan.tanpaBaris.sample.map((file) => <tr key={file.bucket + ":" + file.objectPath}>
                  <td data-label="Path"><small>{file.bucket}/{file.objectPath}</small></td>
                  <td data-label="Ukuran">{formatBytes(file.sizeBytes)}</td>
                  <td data-label="Diubah"><span className={styles.meta}>{formatWib(file.modifiedAt)}</span></td>
                  <td data-label="Aksi"><button type="button" className={styles.dangerBtn} onClick={() => { setPending(file); setConfirmText(""); }}>Hapus</button></td>
                </tr>)}</tbody>
              </table></div>
              {scan.tanpaBaris.sampleTruncated && <p><small>Hanya 200 entri pertama ditampilkan. Hapus sebagian lalu jalankan scan ulang untuk melihat sisanya.</small></p>}
            </div>}

            {scan.menungguWorker.count > 0 && <div>
              <h3>Menunggu worker — {count.format(scan.menungguWorker.count)} file · {formatBytes(scan.menungguWorker.bytes)}</h3>
              <p><small>Barisnya sudah berstatus <em>deleted</em> dan file fisiknya dijadwalkan dihapus worker lewat event <code>media.cleanup</code>. Tidak ada tombol hapus di sini: baris itu sengaja dipertahankan supaya worker masih bisa menemukan path-nya. Periksa antrean di <Link href="/dashboard/outbox">Outbox</Link> bila jumlahnya tidak turun.</small></p>
              <ul>{scan.menungguWorker.sample.slice(0, 20).map((file) => <li key={file.bucket + ":" + file.objectPath}><small>{file.bucket}/{file.objectPath} — {formatBytes(file.sizeBytes)}</small></li>)}</ul>
            </div>}

            {scan.sisaQuarantine.count > 0 && <div>
              <h3>Sisa quarantine — {count.format(scan.sisaQuarantine.count)} file · {formatBytes(scan.sisaQuarantine.bytes)}</h3>
              <p><small>File di bucket <code>quarantine</code>: upload yang berhenti sebelum diverifikasi atau ditolak. Laporan saja untuk sekarang.</small></p>
              <ul>{scan.sisaQuarantine.sample.slice(0, 20).map((file) => <li key={file.bucket + ":" + file.objectPath}><small>{file.objectPath} — {formatBytes(file.sizeBytes)}{file.status ? " · status " + file.status : " · tanpa baris"}</small></li>)}</ul>
            </div>}

            {scan.fileHilang.count > 0 && <div>
              <h3>File hilang — {count.format(scan.fileHilang.count)} baris</h3>
              <p><small>Barisnya masih aktif tapi file fisiknya tidak ada di disk, jadi pratinjau dan halaman publik akan gagal memuatnya. Tidak ada yang bisa dihapus; properti terkait perlu unggah ulang.</small></p>
              <ul>{scan.fileHilang.sample.slice(0, 20).map((file) => <li key={file.mediaId}><small>{file.bucket}/{file.objectPath} — media {file.mediaId}</small></li>)}</ul>
            </div>}
          </>}
      </>}
    </section>

    {stats && stats.byType.length > 0 && <section className={styles.panel}>
      <div className={styles.panelHead}><h2>Rincian</h2></div>
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Kelompok</th><th>Jumlah</th><th>Ukuran</th></tr></thead>
        <tbody>
          {stats.byType.map((row) => <tr key={"type-" + row.contentType}><td data-label="Kelompok">{row.contentType}</td><td data-label="Jumlah">{count.format(row.count)}</td><td data-label="Ukuran">{formatBytes(row.bytes)}</td></tr>)}
          {stats.byStatus.map((row) => <tr key={"status-" + row.status}><td data-label="Kelompok">Status {row.status}</td><td data-label="Jumlah">{count.format(row.count)}</td><td data-label="Ukuran">{formatBytes(row.bytes)}</td></tr>)}
        </tbody>
      </table></div>
      <p><small>Baris berstatus <em>deleted</em> masih tercatat ({count.format(stats.deletedFiles)} · {formatBytes(stats.deletedBytes)}) tetapi file fisiknya sudah atau akan dihapus worker, jadi tidak ikut dihitung di kartu Total file.</small></p>
    </section>}
  </>;
}
