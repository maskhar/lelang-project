"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { StatusBadge } from "@/components/status-badge";
import styles from "./dashboard-shell.module.css";

type Kind = "audit" | "outbox" | "users";
type Audit = { id: string; actorId: string | null; action: string; entityType: string; entityId: string | null; createdAt: string };
type Outbox = { id: string; type: string; status: string; attempts: number; availableAt: string; createdAt: string };
type User = { id: string; name: string; email: string; status: string; role: string | null; createdAt: string };
type Row = Audit | Outbox | User;
const titles = { audit: "Audit", outbox: "Outbox", users: "Akun" };
const descriptions = {
  audit: "Jejak aktivitas administrator dan staf. Maksimal 200 aktivitas terbaru; bukan seluruh riwayat.",
  outbox: "Antrean pekerjaan worker. Maksimal 200 event terbaru; bukan total antrean.",
  users: "Daftar akun dan hak akses. Perubahan akun tetap melalui CLI oleh operator berwenang.",
};
const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export default function AdminOperations({ kind }: { kind: Kind }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const mutationLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Row[]>("/api/v1/admin/" + kind, { cache: "no-store", signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setRows(data); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error("Gagal memuat data.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, refresh]);

  function reload() {
    setError(null);
    setLoading(true);
    setRefresh((value) => value + 1);
  }

  async function retry(event: Outbox) {
    if (mutationLock.current || event.status !== "dead_letter") return;
    if (!window.confirm("Ulangi event " + event.id + "? Worker akan memproses ulang pekerjaan ini. Pengiriman notifikasi dapat terjadi kembali.")) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await apiRequest("/api/v1/admin/outbox", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ id: event.id }) });
      setRows((current) => current.map((row) => row.id === event.id ? { ...row, status: "pending", attempts: 0 } : row));
      setNotice("Event masuk antrean kembali. Worker masih perlu memprosesnya.");
      reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Gagal mengulang event."));
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  const search = query.trim().toLocaleLowerCase("id-ID");
  const visible = rows.filter((row) => {
    const text = "action" in row ? [row.id, row.action, row.actorId, row.entityType, row.entityId] : "email" in row ? [row.name, row.email, row.role, row.id] : [row.type, row.id];
    return (!status || ("status" in row && row.status === status)) && text.join(" ").toLocaleLowerCase("id-ID").includes(search);
  });
  const users = new Map<string, User & { roles: string[] }>();
  for (const row of visible) {
    if (!("email" in row)) continue;
    const existing = users.get(row.id);
    if (existing) { if (row.role && !existing.roles.includes(row.role)) existing.roles.push(row.role); }
    else users.set(row.id, { ...row, roles: row.role ? [row.role] : [] });
  }
  const denied = error instanceof ApiClientError && (error.status === 401 || error.status === 403);

  return <>
    <div className={styles.heading}><div><h1>{titles[kind]}</h1><p>{descriptions[kind]}</p></div><div className={styles.actions}><button type="button" disabled={loading || busy} onClick={reload}>Muat ulang</button></div></div>
    <section className={styles.panel} aria-busy={loading || busy}>
      <div className={styles.filters}>
        <label>Cari pada data dimuat <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {kind !== "audit" && <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{(kind === "outbox" ? ["pending", "processing", "processed", "dead_letter"] : ["active", "pending", "disabled"]).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
      </div>
      {error && <div role="alert" className={styles.error}>{error.message}{error instanceof ApiClientError && error.status === 401 && <> <Link href="/login">Login kembali</Link></>}</div>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status" className={styles.empty}>Memuat data…</p> : !denied && (!visible.length ? <p className={styles.empty}>{error ? "Data belum tersedia. Coba muat ulang." : "Tidak ada data yang cocok."}</p> : <>
        <p>{kind === "users" ? users.size : visible.length} hasil dari data yang dimuat.</p>
        {kind === "audit" && <table className={styles.table}><caption>Aktivitas terbaru · waktu WIB</caption><thead><tr><th scope="col">Waktu</th><th scope="col">Aktor</th><th scope="col">Aktivitas</th><th scope="col">Entitas</th></tr></thead><tbody>{(visible as Audit[]).map((row) => <tr key={row.id}><td>{timestamp(row.createdAt)}</td><td>{row.actorId || "Sistem / pengunjung"}</td><td>{row.action}</td><td>{row.entityType}<br /><small>{row.entityId || "—"}</small></td></tr>)}</tbody></table>}
        {kind === "outbox" && <table className={styles.table}><caption>Event worker · waktu WIB</caption><thead><tr><th scope="col">Event</th><th scope="col">Status</th><th scope="col">Percobaan</th><th scope="col">Jadwal tersedia</th><th scope="col">Aksi</th></tr></thead><tbody>{(visible as Outbox[]).map((row) => <tr key={row.id}><td>{row.type}<br /><small>{row.id}</small></td><td><StatusBadge kind="outbox" value={row.status} /></td><td>{row.attempts}</td><td>{timestamp(row.availableAt)}</td><td>{row.status === "dead_letter" ? <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void retry(row)}>Ulangi event</button></div> : "—"}</td></tr>)}</tbody></table>}
        {kind === "users" && <table className={styles.table}><caption>Akun aplikasi · waktu WIB</caption><thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Role</th><th scope="col">Dibuat</th></tr></thead><tbody>{Array.from(users.values()).map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.status}</td><td>{row.roles.join(", ") || "Belum memiliki role"}</td><td>{timestamp(row.createdAt)}</td></tr>)}</tbody></table>}
      </>)}
      {kind === "audit" && <p>Metadata mentah tidak ditampilkan untuk menghindari paparan data sensitif.</p>}
      {kind === "outbox" && <p>Payload dan pesan error internal tidak ditampilkan. Retry hanya tersedia untuk dead-letter.</p>}
    </section>
  </>;
}
