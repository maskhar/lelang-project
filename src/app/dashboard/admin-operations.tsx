"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { StatusBadge } from "@/components/status-badge";
import styles from "./dashboard-shell.module.css";

type Kind = "audit" | "outbox" | "users";
type Audit = { id: string; actorId: string | null; action: string; entityType: string; entityId: string | null; createdAt: string };
type Outbox = { id: string; type: string; status: string; attempts: number; availableAt: string; createdAt: string };
type User = { id: string; name: string; email: string; status: string; roles: string[]; createdAt: string };
type Row = Audit | Outbox | User;
type Page = { items: Row[]; nextCursor: string | null; total: number };
const titles = { audit: "Audit", outbox: "Outbox", users: "Akun" };
const descriptions = { audit: "Jejak aktivitas administrator dan staf.", outbox: "Antrean pekerjaan worker.", users: "Daftar akun dan hak akses. Perubahan akun tetap melalui CLI oleh operator berwenang." };
const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export default function AdminOperations({ kind }: { kind: Kind }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const mutationLock = useRef(false);

  const endpoint = useCallback((cursor?: string) => {
    const parameters = new URLSearchParams({ page: "1", limit: "50" });
    if (query.trim()) parameters.set("q", query.trim());
    if (status) parameters.set("status", status);
    if (cursor) parameters.set("cursor", cursor);
    return "/api/v1/admin/" + kind + "?" + parameters;
  }, [kind, query, status]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError(null);
      apiRequest<Page>(endpoint(), { cache: "no-store", signal: controller.signal }).then((page) => { if (!controller.signal.aborted) { setRows(page.items); setNextCursor(page.nextCursor); setTotal(page.total); } }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error("Gagal memuat data.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [endpoint, refresh]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setError(null);
    try { const page = await apiRequest<Page>(endpoint(nextCursor), { cache: "no-store" }); setRows((current) => [...current, ...page.items]); setNextCursor(page.nextCursor); setTotal(page.total); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal memuat halaman berikutnya.")); }
    finally { setLoadingMore(false); }
  }
  async function retry(event: Outbox) {
    if (mutationLock.current || event.status !== "dead_letter" || !window.confirm("Ulangi event " + event.id + "? Pengiriman notifikasi dapat terjadi kembali.")) return;
    mutationLock.current = true; setNotice(""); setError(null);
    try { await apiRequest("/api/v1/admin/outbox", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ id: event.id }) }); setNotice("Event masuk antrean kembali."); setRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal mengulang event.")); }
    finally { mutationLock.current = false; }
  }
  const denied = error instanceof ApiClientError && (error.status === 401 || error.status === 403);
  return <><div className={styles.heading}><div><h1>{titles[kind]}</h1><p>{descriptions[kind]}</p></div><div className={styles.actions}><button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Muat ulang</button></div></div><section className={styles.panel} aria-busy={loading || loadingMore}><div className={styles.filters}><label>Cari <input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} /></label>{kind !== "audit" && <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{(kind === "outbox" ? ["pending", "processing", "processed", "dead_letter"] : ["active", "disabled"]).map((value) => <option key={value}>{value}</option>)}</select></label>}</div>{error && <div role="alert" className={styles.error}>{error.message}{error instanceof ApiClientError && error.status === 401 && <> <Link href="/login">Login kembali</Link></>}</div>}{notice && <p role="status">{notice}</p>}{loading ? <p className={styles.empty}>Memuat data…</p> : !denied && (!rows.length ? <p className={styles.empty}>Tidak ada data yang cocok.</p> : <><p>Menampilkan {rows.length} dari {total} data.</p>{kind === "audit" && <table className={styles.table}><thead><tr><th>Waktu</th><th>Aktor</th><th>Aktivitas</th><th>Entitas</th></tr></thead><tbody>{(rows as Audit[]).map((row) => <tr key={row.id}><td>{timestamp(row.createdAt)}</td><td>{row.actorId || "Sistem / pengunjung"}</td><td>{row.action}</td><td>{row.entityType}<br/><small>{row.entityId || "—"}</small></td></tr>)}</tbody></table>}{kind === "outbox" && <table className={styles.table}><thead><tr><th>Event</th><th>Status</th><th>Percobaan</th><th>Tersedia</th><th>Aksi</th></tr></thead><tbody>{(rows as Outbox[]).map((row) => <tr key={row.id}><td>{row.type}<br/><small>{row.id}</small></td><td><StatusBadge kind="outbox" value={row.status}/></td><td>{row.attempts}</td><td>{timestamp(row.availableAt)}</td><td>{row.status === "dead_letter" ? <button type="button" onClick={() => void retry(row)}>Ulangi</button> : "—"}</td></tr>)}</tbody></table>}{kind === "users" && <table className={styles.table}><thead><tr><th>Nama</th><th>Email</th><th>Status</th><th>Role</th><th>Dibuat</th></tr></thead><tbody>{(rows as User[]).map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td>{row.status}</td><td>{row.roles.join(", ") || "Belum memiliki role"}</td><td>{timestamp(row.createdAt)}</td></tr>)}</tbody></table>}{nextCursor && <div className={styles.actions}><button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Memuat…" : "Muat lebih banyak"}</button></div>}</>)}{kind === "audit" && <p>Metadata mentah tidak ditampilkan.</p>}{kind === "outbox" && <p>Payload dan pesan error internal tidak ditampilkan.</p>}</section></>;
}
