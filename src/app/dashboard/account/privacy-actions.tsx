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

export function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/account/export", { cache: "no-store" });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "data-akun-lelang-properti.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch { setError("Gagal mengunduh data. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <><button type="button" className={styles.primary} disabled={busy} onClick={() => void download()}>{busy ? "Menyiapkan…" : "Unduh data saya"}</button>{error && <p role="alert" className={styles.error}>{error}</p>}</>;
}

export function DeleteAccountButton() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm("Hapus akun secara permanen? Semua sesi dicabut, tautan Google diputus, hak akses dihapus, dan data profil dianonimkan. Tindakan ini tidak dapat dibatalkan.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/account/delete", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrfToken() }, body: JSON.stringify({ confirm }) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message || "Gagal menghapus akun."); }
      router.push("/login");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menghapus akun."); setBusy(false); }
  }
  return <>
    <label className={styles.hint}>Ketik <b>HAPUS AKUN</b> untuk mengaktifkan tombol <input value={confirm} maxLength={20} onChange={(event) => setConfirm(event.target.value)} aria-label='Konfirmasi ketik HAPUS AKUN' /></label>
    <div className={styles.actions}><button type="button" className={styles.danger} disabled={busy || confirm !== "HAPUS AKUN"} onClick={() => void remove()}>{busy ? "Menghapus…" : "Hapus akun"}</button></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </>;
}
