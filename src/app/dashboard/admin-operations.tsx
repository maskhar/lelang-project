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
const descriptions = { audit: "Jejak aktivitas administrator dan staf.", outbox: "Antrean pekerjaan worker.", users: "Daftar akun dan hak akses. Beri/cabut role dan nonaktifkan akun dari sini; setiap perubahan mencabut sesi aktif akun tersebut dan tercatat di audit. Perubahan pada akun Anda sendiri tetap melalui CLI." };
const roleOptions = ["editor", "admin", "owner", "agent", "buyer"] as const;
const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

// Kontrol per baris akun. Akun admin sendiri tidak diberi kontrol: API menolak self-lockout
// (cabut admin sendiri / nonaktifkan diri), jadi UI tidak menawarkan aksi yang pasti gagal.
function UserActions({ row, self, busy, onRole, onStatus }: { row: User; self: boolean; busy: boolean; onRole: (role: typeof roleOptions[number], grant: boolean) => void; onStatus: (status: "active" | "disabled") => void }) {
  const [role, setRole] = useState<typeof roleOptions[number]>("buyer");
  if (self) return <small>Akun sendiri — gunakan CLI</small>;
  const has = row.roles.includes(role);
  return <div className={styles.actions}><select aria-label="Role" value={role} disabled={busy} onChange={(event) => setRole(event.target.value as typeof roleOptions[number])}>{roleOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select><button type="button" disabled={busy} onClick={() => onRole(role, !has)}>{has ? "Cabut" : "Beri"}</button><button type="button" disabled={busy} onClick={() => onStatus(row.status === "active" ? "disabled" : "active")}>{row.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button></div>;
}

export default function AdminOperations({ kind, actorId }: { kind: Kind; actorId: string }) {
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
  async function changeRole(user: User, role: typeof roleOptions[number], grant: boolean) {
    if (mutationLock.current || !window.confirm((grant ? "Beri role " : "Cabut role ") + role + " untuk " + user.email + "? Sesi aktif akun ini akan dicabut.")) return;
    mutationLock.current = true; setNotice(""); setError(null);
    try { await apiRequest("/api/v1/admin/users", { method: grant ? "POST" : "DELETE", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ userId: user.id, role }) }); setNotice((grant ? "Role diberikan: " : "Role dicabut: ") + role + "."); setRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal mengubah role.")); }
    finally { mutationLock.current = false; }
  }
  async function changeStatus(user: User, nextStatus: "active" | "disabled") {
    if (mutationLock.current || !window.confirm((nextStatus === "disabled" ? "Nonaktifkan akun " : "Aktifkan akun ") + user.email + "?" + (nextStatus === "disabled" ? " Sesi aktifnya akan dicabut." : ""))) return;
    mutationLock.current = true; setNotice(""); setError(null);
    try { await apiRequest("/api/v1/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ id: user.id, status: nextStatus }) }); setNotice(nextStatus === "disabled" ? "Akun dinonaktifkan." : "Akun diaktifkan."); setRefresh((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason : new Error("Gagal mengubah status akun.")); }
    finally { mutationLock.current = false; }
  }
  const denied = error instanceof ApiClientError && (error.status === 401 || error.status === 403);
  return <><div className={styles.heading}><div><h1>{titles[kind]}</h1><p>{descriptions[kind]}</p></div><div className={styles.actions}><button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Muat ulang</button></div></div><section className={styles.panel} aria-busy={loading || loadingMore}><div className={styles.filters}><label>Cari <input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} /></label>{kind !== "audit" && <label>Status <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{(kind === "outbox" ? ["pending", "processing", "processed", "dead_letter"] : ["active", "disabled"]).map((value) => <option key={value}>{value}</option>)}</select></label>}</div>{error && <div role="alert" className={styles.error}>{error.message}{error instanceof ApiClientError && error.status === 401 && <> <Link href="/login">Login kembali</Link></>}</div>}{notice && <p role="status">{notice}</p>}{loading ? <p className={styles.empty}>Memuat data…</p> : !denied && (!rows.length ? <p className={styles.empty}>Tidak ada data yang cocok.</p> : <><p>Menampilkan {rows.length} dari {total} data.</p>{kind === "audit" && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Waktu</th><th>Aktor</th><th>Aktivitas</th><th>Entitas</th></tr></thead><tbody>{(rows as Audit[]).map((row) => <tr key={row.id}><td data-label="Waktu">{timestamp(row.createdAt)}</td><td data-label="Aktor">{row.actorId || "Sistem / pengunjung"}</td><td data-label="Aktivitas">{row.action}</td><td data-label="Entitas">{row.entityType}<br/><small>{row.entityId || "—"}</small></td></tr>)}</tbody></table></div>}{kind === "outbox" && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Event</th><th>Status</th><th>Percobaan</th><th>Tersedia</th><th>Aksi</th></tr></thead><tbody>{(rows as Outbox[]).map((row) => <tr key={row.id}><td data-label="Event">{row.type}<br/><small>{row.id}</small></td><td data-label="Status"><StatusBadge kind="outbox" value={row.status}/></td><td data-label="Percobaan">{row.attempts}</td><td data-label="Tersedia">{timestamp(row.availableAt)}</td><td data-label="Aksi">{row.status === "dead_letter" ? <button type="button" onClick={() => void retry(row)}>Ulangi</button> : "—"}</td></tr>)}</tbody></table></div>}{kind === "users" && <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Nama</th><th>Email</th><th>Status</th><th>Role</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>{(rows as User[]).map((row) => <tr key={row.id}><td data-label="Nama">{row.name}</td><td data-label="Email">{row.email}</td><td data-label="Status">{row.status}</td><td data-label="Role">{row.roles.join(", ") || "Belum memiliki role"}</td><td data-label="Dibuat">{timestamp(row.createdAt)}</td><td data-label="Aksi"><UserActions row={row} self={row.id === actorId} busy={loading || loadingMore} onRole={(role, grant) => void changeRole(row, role, grant)} onStatus={(next) => void changeStatus(row, next)}/></td></tr>)}</tbody></table></div>}{nextCursor && <div className={styles.actions}><button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Memuat…" : "Muat lebih banyak"}</button></div>}</>)}{kind === "audit" && <p>Metadata mentah tidak ditampilkan.</p>}{kind === "outbox" && <p>Payload dan pesan error internal tidak ditampilkan.</p>}</section></>;
}
