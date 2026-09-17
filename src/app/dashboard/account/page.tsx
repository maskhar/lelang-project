import { cookies } from "next/headers";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { sessionCookieName } from "@/server/auth/session";
import { listActiveSessions } from "@/server/auth/service";
import { LogoutAllButton, LogoutButton } from "./logout-button";
import { DeleteAccountButton, ExportDataButton } from "./privacy-actions";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

const formatTime = (value: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value) + " WIB";
const roleLabels: Record<string, string> = { admin: "Administrator", editor: "Editor", owner: "Pemilik produk", agent: "Agent", buyer: "Pembeli" };

export default async function AccountPage() {
  const actor = await getAuthenticatedActor();
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  const sessions = await listActiveSessions(actor.profileId, token);
  const initial = actor.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <div className={styles.avatar} aria-label={actor.avatarUrl ? "Foto profil Google" : "Inisial pengguna"} style={actor.avatarUrl ? { backgroundImage: `url(${actor.avatarUrl})` } : undefined}>{!actor.avatarUrl && initial}</div>
            <div className={styles.meta}>
              <p>{actor.name}</p>
              <p>{actor.email}</p>
              <div className={styles.roles}>{actor.roles.map((role) => <span key={role} className={styles.role}>{roleLabels[role] ?? role}</span>)}</div>
            </div>
          </div>
        </header>

        <section className={styles.section}>
          <h2>Sesi aktif ({sessions.length})</h2>
          <p className={styles.hint}>Sesi berakhir 8 jam setelah masuk. Maksimal 5 sesi aktif; sesi tertua dicabut otomatis saat melebihi batas.</p>
          {sessions.length === 0 ? <p className={styles.empty}>Tidak ada sesi aktif.</p> : (
            <ul className={styles.sessions}>
              {sessions.map((session, index) => (
                <li key={session.id} className={styles.session}>
                  <div className={styles.row}><b>{session.current ? "Sesi ini" : "Sesi " + (index + 1)}</b><span>Masuk {formatTime(session.createdAt)}</span></div>
                  <div className={styles.row}><span>Terakhir aktif {formatTime(session.lastSeenAt)}</span><span>Berakhir {formatTime(session.expiresAt)}</span></div><div className={styles.row}><span>IP: {session.ipAddress || "Tidak tersedia"}</span></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h2>Keluar</h2>
          <p className={styles.hint}>Keluar dari perangkat ini saja, atau cabut semua sesi sekaligus bila perangkat lain hilang.</p>
          <div className={styles.actions}><LogoutButton /><LogoutAllButton /></div>
        </section>

        <section className={styles.section}>
          <h2>Data pribadi</h2>
          <p className={styles.hint}>Unduh salinan data akun Anda dalam format JSON: profil, hak akses, pengajuan akses, lead, watchlist, listing milik Anda, penugasan, dan sesi aktif. Lihat <a href="/kebijakan-privasi">Kebijakan Privasi</a>.</p>
          <div className={styles.actions}><ExportDataButton /></div>
        </section>

        <section className={styles.section}>
          <h2>Hapus akun</h2>
          <p className={styles.hint}>Penghapusan mencabut semua sesi, memutus tautan akun Google, menghapus hak akses, serta menganonimkan nama, foto, dan nomor telepon. Catatan transaksi, lead, listing, dan audit tetap disimpan sesuai kewajiban hukum dan tidak lagi terhubung ke profil aktif. Tindakan ini tidak dapat dibatalkan.</p>
          <DeleteAccountButton />
        </section>
      </div>
    </main>
  );
}