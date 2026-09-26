"use client";
import { useEffect, useRef, useState } from "react";
import { apiRequest, ApiClientError } from "./api-client";
import styles from "@/app/dashboard/dashboard-shell.module.css";

type Change = { label: string; before: string; after: string };
type Entry = { id: string; createdAt: string; actorName: string | null; actorEmail: string | null; action: string; actionLabel: string; reason: string | null; bulk: boolean; mediaShared: number | null; changes: Change[] };
const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

// Tombol + popup riwayat aktivitas satu properti: siapa, kapan, aksi apa, dan field mana yang berubah.
// Data hanya diambil saat popup pertama dibuka (hemat request di daftar properti yang berisi 100 baris).
export default function PropertyAuditLog({ propertyId, title }: { propertyId: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open || entries) return;
    const controller = new AbortController();
    async function run() {
      setLoading(true); setError("");
      try { setEntries(await apiRequest<Entry[]>("/api/v1/properties/" + propertyId + "/audit", { cache: "no-store", signal: controller.signal })); }
      catch (reason) { if (!controller.signal.aborted) setError(reason instanceof ApiClientError ? reason.message : "Gagal memuat riwayat aktivitas."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void run();
    return () => controller.abort();
  }, [open, entries, propertyId]);

  return <>
    <button type="button" aria-label={title ? "Lihat log aktivitas " + title : "Lihat log aktivitas properti"} onClick={() => setOpen(true)}>Log</button>
    {open && <div className={styles.auditBackdrop} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} tabIndex={-1} className={styles.auditModal} role="dialog" aria-modal="true" aria-labelledby="audit-log-title">
        <div className={styles.auditHead}>
          <h2 id="audit-log-title">Riwayat aktivitas</h2>
          <button type="button" onClick={() => setOpen(false)}>Tutup</button>
        </div>
        <p>{title ? title + " — urut dari yang terbaru." : "Urut dari yang terbaru."}</p>
        {loading && <p>Memuat…</p>}
        {error && <p className={styles.error}>{error}</p>}
        {entries && (entries.length ? <ul className={styles.auditList}>
          {entries.map((entry) => <li key={entry.id} className={styles.auditEntry}>
            <span className={styles.auditTime}>{timestamp(entry.createdAt)}</span>
            <span><span className={styles.auditWho}>{entry.actorName || entry.actorEmail || "Sistem"}</span> · {entry.actionLabel}{entry.bulk ? " (operasi massal)" : ""}</span>
            {entry.actorEmail && entry.actorName && <p className={styles.auditReason}>{entry.actorEmail}</p>}
            {entry.reason && <p className={styles.auditReason}>Alasan: {entry.reason}</p>}
            {entry.mediaShared ? <p className={styles.auditReason}>{entry.mediaShared} foto digunakan ulang dari revisi sebelumnya.</p> : null}
            {entry.changes.length > 0 && <ul className={styles.auditChanges}>
              {entry.changes.map((change) => <li key={change.label}><b>{change.label}</b><span>{change.before} → {change.after}</span></li>)}
            </ul>}
          </li>)}
        </ul> : <p className={styles.empty}>Belum ada aktivitas tercatat.</p>)}
      </section>
    </div>}
  </>;
}
