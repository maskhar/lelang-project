"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

async function csrfToken() {
  const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store", headers: { Origin: window.location.origin } });
  const token = csrf.headers.get("X-CSRF-Token");
  if (!csrf.ok || !token) throw new Error("CSRF unavailable.");
  return token;
}

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST", headers: { "X-CSRF-Token": await csrfToken() } });
      if (!response.ok) throw new Error("Logout failed.");
      router.push("/login");
      router.refresh();
    } catch {
      setError("Gagal keluar. Coba lagi.");
      setBusy(false);
    }
  }
  return <><button type="button" className={styles.primary} disabled={busy} onClick={logout}>{busy ? "Keluar…" : "Keluar"}</button>{error && <p role="alert" className={styles.error}>{error}</p>}</>;
}

export function LogoutAllButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logoutAll() {
    if (!window.confirm("Keluar dari semua perangkat? Semua sesi aktif termasuk sesi ini akan dicabut.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout-all", { method: "POST", headers: { "X-CSRF-Token": await csrfToken() } });
      if (!response.ok) throw new Error("Logout all failed.");
      router.push("/login");
      router.refresh();
    } catch {
      setError("Gagal mencabut sesi. Coba lagi.");
      setBusy(false);
    }
  }
  return <><button type="button" className={styles.danger} disabled={busy} onClick={logoutAll}>{busy ? "Mencabut…" : "Keluar dari semua perangkat"}</button>{error && <p role="alert" className={styles.error}>{error}</p>}</>;
}
