"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store", headers: { Origin: window.location.origin } });
      const token = csrf.headers.get("X-CSRF-Token");
      if (!csrf.ok || !token) throw new Error("CSRF unavailable.");
      const response = await fetch("/api/v1/auth/logout", { method: "POST", headers: { "X-CSRF-Token": token } });
      if (!response.ok) throw new Error("Logout failed.");
      router.push("/login");
      router.refresh();
    } catch {
      setError("Gagal keluar. Coba lagi.");
      setBusy(false);
    }
  }
  return <><button type="button" disabled={busy} onClick={logout}>{busy ? "Keluar…" : "Keluar"}</button>{error && <p role="alert">{error}</p>}</>;
}
