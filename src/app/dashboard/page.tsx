import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthorizationError, getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { dashboardSummary } from "@/server/properties/service";
import styles from "./dashboard-shell.module.css";
import WelcomeModal from "./welcome-modal";

export const dynamic = "force-dynamic";

const listingLabels: Record<string, string> = {
  draft: "Draft", pending_review: "Menunggu review", revision_required: "Perlu revisi", scheduled: "Terjadwal",
  published: "Terpublikasi", paused: "Dijeda", rejected: "Ditolak", archived: "Diarsipkan",
};
const leadLabels: Record<string, string> = { new: "Baru", contacted: "Dihubungi", closed: "Selesai", spam: "Spam" };
const availabilityLabels: Record<string, string> = { available: "Tersedia", sold: "Terjual" };
const saleModeLabels: Record<string, string> = { auction: "Lelang", direct_sale: "Jual langsung" };
const mediaLabels: Record<string, string> = { pending: "Menunggu verifikasi", ready: "Siap", rejected: "Ditolak", deleted: "Dihapus" };
const dayLabel = (value: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(value + "T00:00:00Z"));

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  let actor;
  try { actor = requireRole(await getAuthenticatedActor(), "editor", "admin", "owner", "buyer"); }
  catch (error) {
    if (error instanceof AuthorizationError) return <section><h1>Akses ditolak</h1><p>Akun belum memiliki izin dashboard.</p></section>;
    throw error;
  }
  if (actor.roles.includes("buyer") && !actor.roles.includes("editor") && !actor.roles.includes("admin")) redirect("/dashboard/leads");
  if (!actor.roles.includes("editor") && !actor.roles.includes("admin")) redirect("/dashboard/properties");
  const summary = await dashboardSummary(actor);
  const showWelcome = (await searchParams).welcome === "1";
  const sum = (rows: Array<{ count: number }>) => rows.reduce((total, row) => total + row.count, 0);
  const count = (rows: Array<{ status: string; count: number }>, status: string) => rows.find((row) => row.status === status)?.count ?? 0;
  const listingTotal = sum(summary.listings);
  const leadTotal = sum(summary.leads);
  const mediaTotal = sum(summary.media);
  const published = count(summary.listings, "published");
  const needsReview = count(summary.listings, "pending_review");
  const newLeads = count(summary.leads, "new");
  const pendingMedia = count(summary.media, "pending");
  const sold = count(summary.availability, "sold");
  const activityMax = Math.max(1, ...summary.activity.map((day) => day.leads + day.published + day.logins));
  const activityTotals = summary.activity.reduce((totals, day) => ({ leads: totals.leads + day.leads, published: totals.published + day.published, logins: totals.logins + day.logins }), { leads: 0, published: 0, logins: 0 });
  const listingTone = (status: string) => status === "published" ? "green" : status === "pending_review" ? "gold" : status === "rejected" ? "red" : ["archived", "draft"].includes(status) ? "muted" : undefined;
  const leadTone = (status: string) => status === "new" ? "gold" : status === "closed" ? "green" : status === "spam" ? "red" : undefined;
  const saleModeTotal = sum(summary.saleModes);
  const donutColors: Record<string, string> = { auction: "#c89b3c", direct_sale: "#14213d" };
  const donutStops = summary.saleModes.reduce<{ offset: number; stops: string[] }>((state, row) => {
    const end = state.offset + (saleModeTotal ? (row.count / saleModeTotal) * 100 : 0);
    return { offset: end, stops: [...state.stops, (donutColors[row.mode] ?? "#8b93a3") + " " + state.offset + "% " + end + "%"] };
  }, { offset: 0, stops: [] }).stops;

  return (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Ringkasan</h1>
          <p>Selamat datang, {actor.name}. Status listing, lead, media, dan aktivitas 14 hari terakhir.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/dashboard/properties/new">Tambah draft</Link>
          <Link href="/dashboard/properties">Kelola properti</Link>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat} data-tone="green"><span>Terpublikasi</span><strong>{published}</strong><small>dari {listingTotal} listing · {sold} terjual</small></div>
        <div className={styles.stat} data-tone="gold"><span>Menunggu review</span><strong>{needsReview}</strong><small><Link href="/dashboard/properties?review=pending">Buka antrean review</Link></small></div>
        <div className={styles.stat} data-tone="gold"><span>Lead baru</span><strong>{newLeads}</strong><small>dari {leadTotal} lead · <Link href="/dashboard/leads">tindak lanjut</Link></small></div>
        <div className={styles.stat} data-tone={summary.outbox.deadLetter > 0 ? "red" : undefined}><span>Outbox</span><strong>{summary.outbox.pending}</strong><small>{summary.outbox.deadLetter} gagal permanen · <Link href="/dashboard/outbox">lihat antrean</Link></small></div>
      </div>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Aktivitas 14 hari</h2><span className={styles.meta}>{activityTotals.leads} lead · {activityTotals.published} publikasi · {activityTotals.logins} login</span></div>
          <div className={styles.chartScroll}>
            <div className={styles.chart} role="img" aria-label={"Aktivitas harian: " + summary.activity.map((day) => dayLabel(day.day) + " " + day.leads + " lead, " + day.published + " publikasi, " + day.logins + " login").join("; ")}>
              {summary.activity.map((day) => (
                <div className={styles.chartCol} key={day.day}>
                  <span className={styles.chartTip}>{dayLabel(day.day)}: {day.leads} lead · {day.published} publikasi · {day.logins} login</span>
                  {day.logins > 0 && <div className={styles.chartSeg} data-series="logins" style={{ height: (day.logins / activityMax) * 100 + "%" }} />}
                  {day.published > 0 && <div className={styles.chartSeg} data-series="published" style={{ height: (day.published / activityMax) * 100 + "%" }} />}
                  {day.leads > 0 && <div className={styles.chartSeg} data-series="leads" style={{ height: (day.leads / activityMax) * 100 + "%" }} />}
                </div>
              ))}
            </div>
            <div className={styles.chartAxis} aria-hidden="true">{summary.activity.map((day) => <span key={day.day}>{dayLabel(day.day)}</span>)}</div>
          </div>
          <div className={styles.chartLegend}><span><i style={{ background: "#c89b3c" }} />Lead</span><span><i style={{ background: "#2f6b4f" }} />Publikasi</span><span><i style={{ background: "#14213d", opacity: .7 }} />Login</span></div>
        </section>

        <div className={styles.threeCol}>
          <section className={styles.panel}>
            <h2>Listing ({listingTotal})</h2>
            {summary.listings.length === 0 ? <p className={styles.empty}>Belum ada listing.</p> : (
              <div className={styles.bars}>
                {summary.listings.map((row) => (
                  <div className={styles.bar} key={row.status}>
                    <span>{listingLabels[row.status] ?? row.status}</span>
                    <div className={styles.barTrack}><div className={styles.barFill} data-tone={listingTone(row.status)} style={{ width: (row.count / listingTotal) * 100 + "%" }} /></div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2>Lead ({leadTotal})</h2>
            {summary.leads.length === 0 ? <p className={styles.empty}>Belum ada lead.</p> : (
              <div className={styles.bars}>
                {summary.leads.map((row) => (
                  <div className={styles.bar} key={row.status}>
                    <span>{leadLabels[row.status] ?? row.status}</span>
                    <div className={styles.barTrack}><div className={styles.barFill} data-tone={leadTone(row.status)} style={{ width: (row.count / leadTotal) * 100 + "%" }} /></div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2>Mode penjualan</h2>
            {saleModeTotal === 0 ? <p className={styles.empty}>Belum ada listing.</p> : (
              <div className={styles.donutWrap}>
                <div className={styles.donut} style={{ background: "conic-gradient(" + donutStops.join(", ") + ")" }} role="img" aria-label={summary.saleModes.map((row) => (saleModeLabels[row.mode] ?? row.mode) + " " + row.count).join(", ")}>
                  <div className={styles.donutCenter}><strong>{saleModeTotal}</strong><span>listing</span></div>
                </div>
                <ul className={styles.legend}>
                  {summary.saleModes.map((row) => <li key={row.mode}><i style={{ background: donutColors[row.mode] ?? "#8b93a3" }} />{saleModeLabels[row.mode] ?? row.mode}<b>{row.count}</b></li>)}
                  {summary.availability.map((row) => <li key={row.status}><i style={{ background: row.status === "sold" ? "#a83232" : "#2f6b4f" }} />{availabilityLabels[row.status] ?? row.status} (publik)<b>{row.count}</b></li>)}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div className={styles.twoCol}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><h2>Media ({mediaTotal})</h2>{pendingMedia > 0 && <span className={styles.badge} data-status="pending">{pendingMedia} menunggu worker</span>}</div>
            {summary.media.length === 0 ? <p className={styles.empty}>Belum ada foto.</p> : (
              <div className={styles.bars}>
                {summary.media.map((row) => (
                  <div className={styles.bar} key={row.status}>
                    <span>{mediaLabels[row.status] ?? row.status}</span>
                    <div className={styles.barTrack}><div className={styles.barFill} data-tone={row.status === "ready" ? "green" : row.status === "rejected" ? "red" : row.status === "pending" ? "gold" : "muted"} style={{ width: (row.count / mediaTotal) * 100 + "%" }} /></div>
                    <strong>{row.count}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          {summary.users && (
            <section className={styles.panel}>
              <div className={styles.panelHead}><h2>Akun</h2><Link href="/dashboard/users" className={styles.meta}>Kelola akun</Link></div>
              <div className={styles.bars}>
                <div className={styles.bar}><span>Aktif</span><div className={styles.barTrack}><div className={styles.barFill} data-tone="green" style={{ width: (summary.users.total ? summary.users.active / summary.users.total * 100 : 0) + "%" }} /></div><strong>{summary.users.active}</strong></div>
                <div className={styles.bar}><span>Dinonaktifkan</span><div className={styles.barTrack}><div className={styles.barFill} data-tone="red" style={{ width: (summary.users.total ? summary.users.disabled / summary.users.total * 100 : 0) + "%" }} /></div><strong>{summary.users.disabled}</strong></div>
                <div className={styles.bar}><span>Administrator</span><div className={styles.barTrack}><div className={styles.barFill} data-tone="gold" style={{ width: (summary.users.total ? summary.users.admins / summary.users.total * 100 : 0) + "%" }} /></div><strong>{summary.users.admins}</strong></div>
                <div className={styles.bar}><span>Editor</span><div className={styles.barTrack}><div className={styles.barFill} style={{ width: (summary.users.total ? summary.users.editors / summary.users.total * 100 : 0) + "%" }} /></div><strong>{summary.users.editors}</strong></div>
              </div>
              <p className={styles.meta} style={{ marginTop: 12 }}>{summary.users.total} akun · {summary.users.activeSessions} sesi aktif saat ini</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
