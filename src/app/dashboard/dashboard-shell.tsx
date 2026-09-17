"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Actor } from "@/server/auth/actor";
import styles from "./dashboard-shell.module.css";

const staffLinks = [
  { href: "/dashboard/properties", label: "Properti" },
  { href: "/dashboard/review", label: "Review" },
  { href: "/dashboard/leads", label: "Lead" },
];

const ownerLinks = [
  { href: "/dashboard/properties", label: "Properti" },
  { href: "/dashboard/leads", label: "Lead" },
];

const buyerLinks = [
  { href: "/dashboard/leads", label: "Lead" },
  { href: "/dashboard/watchlist", label: "Watchlist" },
];

const adminLinks = [
  { href: "/dashboard/audit", label: "Audit" },
  { href: "/dashboard/outbox", label: "Outbox" },
  { href: "/dashboard/users", label: "Akun" },
  { href: "/dashboard/access-requests", label: "Pengajuan akses" },
];

function linksFor(roles: Actor["roles"]) {
  const isStaff = roles.includes("editor") || roles.includes("admin");
  const links = isStaff ? [...staffLinks] : roles.includes("owner") ? [...ownerLinks] : [];
  if (!isStaff && roles.includes("buyer")) for (const link of buyerLinks) if (!links.some((existing) => existing.href === link.href)) links.push(link);
  if (roles.includes("admin")) links.push(...adminLinks);
  return links;
}

export default function DashboardShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const sidebarOpen = openPath === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeSidebar = () => {
    setOpenPath(null);
    menuButton.current?.focus();
  };
  const links = linksFor(actor.roles);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sidebarOpen) {
        setOpenPath(null);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  return (
    <div className={styles.shell}>
      <button
        type="button"
        ref={menuButton}
        className={styles.menuButton}
        aria-expanded={sidebarOpen}
        aria-controls="dashboard-sidebar"
        onClick={() => setOpenPath(sidebarOpen ? null : pathname)}
      >
        <span aria-hidden="true">☰</span>
        Menu
      </button>

      <aside id="dashboard-sidebar" className={styles.sidebar + (sidebarOpen ? " " + styles.sidebarOpen : "")}>
        <button type="button" className={styles.closeButton} onClick={closeSidebar}>Tutup menu</button>
        <Link href="/dashboard" className={styles.brand}><Image src="/image/logo/white/LP-logo-large-white.png" alt="Lelang Properti" width={1944} height={809} sizes="150px" priority /></Link>
        <nav className={styles.nav} aria-label="Navigasi dashboard">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return <Link key={link.href} href={link.href} onClick={() => setOpenPath(null)} className={active ? styles.active : undefined} aria-current={active ? "page" : undefined}>{link.label}</Link>;
          })}
        </nav>
        <Link className={styles.account} href="/dashboard/account">
          <span className={styles.accountLabel}>Akun</span>
          <span>{actor.name}</span>
        </Link>
      </aside>

      <div className={styles.content}>{children}</div>
    </div>
  );
}


