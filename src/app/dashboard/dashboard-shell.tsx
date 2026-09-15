import Link from "next/link";
import type { Actor } from "@/server/auth/actor";
import styles from "./dashboard-shell.module.css";

export default function DashboardShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  return <div className={styles.shell}><header className={styles.bar}><Link href="/dashboard" className={styles.brand}>Lelang Properti</Link><nav className={styles.nav} aria-label="Navigasi dashboard"><Link href="/dashboard/properties">Properti</Link><Link href="/dashboard/review">Review</Link><Link href="/dashboard/leads">Lead</Link>{actor.roles.includes("admin") && <><Link href="/dashboard/audit">Audit</Link><Link href="/dashboard/outbox">Outbox</Link><Link href="/dashboard/users">Akun</Link></>}</nav><Link className={styles.account} href="/account">{actor.name}</Link></header><div className={styles.content}>{children}</div></div>;
}
