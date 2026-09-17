"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import styles from "../dashboard-shell.module.css";

type Assignment = { id: string; propertyId: string; title: string; agentId?: string; agentName?: string; agentEmail?: string; note?: string | null; assignedAt: string };
type Listing = { id: string; title: string; publicationStatus: string };
type UserRow = { id: string; name: string; email: string; status: string; roles: string[] };
type UserPage = { items: UserRow[] };

const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export default function AssignmentsView({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [agents, setAgents] = useState<UserRow[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const rows = await apiRequest<Assignment[]>(isAdmin ? "/api/v1/admin/assignments" : "/api/v1/agent/assignments", { cache: "no-store" });
      setItems(rows); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat penugasan."); }
  }, [isAdmin]);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Assignment[]>(isAdmin ? "/api/v1/admin/assignments" : "/api/v1/agent/assignments", { cache: "no-store", signal: controller.signal })
      .then((rows) => { if (!controller.signal.aborted) setItems(rows); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Gagal memuat penugasan."); });
    return () => controller.abort();
  }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      try {
        const [listingRows, userPage] = await Promise.all([
          apiRequest<Listing[]>("/api/v1/admin/properties", { cache: "no-store" }),
          apiRequest<UserPage>("/api/v1/admin/users?page=1&limit=100&status=active", { cache: "no-store" }),
        ]);
        setListings(listingRows.filter((row) => row.publicationStatus !== "archived"));
        setAgents(userPage.items.filter((row) => row.roles.includes("agent")));
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat pilihan penugasan."); }
    })();
  }, [isAdmin]);

  async function assign() {
    if (!propertyId || !agentId) { setError("Pilih properti dan agent terlebih dahulu."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/api/v1/admin/assignments", { method: "POST", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ propertyId, agentId, note: note.trim() || undefined }) });
      setNotice("Penugasan dibuat."); setNote(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal membuat penugasan."); }
    finally { setBusy(false); }
  }

  async function unassign(item: Assignment) {
    if (!window.confirm("Cabut penugasan " + item.title + " dari " + (item.agentName || "agent") + "?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/api/v1/admin/assignments", { method: "DELETE", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ id: item.id }) });
      setNotice("Penugasan dicabut."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal mencabut penugasan."); }
    finally { setBusy(false); }
  }

  return <>
    <div className={styles.heading}><div><h1>Penugasan</h1><p>{isAdmin ? "Tugaskan agent ke listing. Agent hanya melihat lead dari listing yang ditugaskan." : "Listing yang ditugaskan kepada Anda. Lead listing ini tampil di halaman Lead."}</p></div><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void load()}>Muat ulang</button></div></div>
    {isAdmin && <section className={styles.panel}>
      <h2>Tugaskan agent</h2>
      <div className={styles.filters}>
        <label>Properti <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Pilih properti</option>{listings.map((row) => <option key={row.id} value={row.id}>{row.title} · {row.publicationStatus}</option>)}</select></label>
        <label>Agent <select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Pilih agent</option>{agents.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}</select></label>
        <label>Catatan <input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></label>
      </div>
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void assign()}>{busy ? "Menyimpan…" : "Tugaskan"}</button></div>
      {!agents.length && <p className={styles.empty}>Belum ada akun dengan role agent aktif.</p>}
    </section>}
    <section className={styles.panel} aria-busy={busy}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {items.length ? <table className={styles.table}>
        <thead><tr><th>Properti</th>{isAdmin && <th>Agent</th>}<th>Ditugaskan</th>{isAdmin && <th>Aksi</th>}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td>{item.title}{item.note && <><br /><small>{item.note}</small></>}</td>
          {isAdmin && <td>{item.agentName}<br /><small>{item.agentEmail}</small></td>}
          <td>{timestamp(item.assignedAt)}</td>
          {isAdmin && <td><button type="button" disabled={busy} onClick={() => void unassign(item)}>Cabut</button></td>}
        </tr>)}</tbody>
      </table> : <p className={styles.empty}>{isAdmin ? "Belum ada penugasan aktif." : "Belum ada listing yang ditugaskan kepada Anda."}</p>}
    </section>
  </>;
}
