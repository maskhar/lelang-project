"use client";
import { useState } from "react";

export default function ListingReview({ id, version, onChanged }: { id: string; version: number; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  async function act(action: string) {
    setBusy(true); setMessage("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      const token = csrf.headers.get("x-csrf-token");
      if (!csrf.ok || !token) throw new Error("Sesi tidak tersedia.");
      const response = await fetch("/api/v1/properties/" + id, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ version, action, reason: reason || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Aksi gagal.");
      setMessage("Status diperbarui."); await onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Aksi gagal."); }
    finally { setBusy(false); }
  }
  return <div><label>Alasan review/arsip <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label><div>{[["submit", "Kirim review"], ["approve", "Publikasikan"], ["revision", "Minta revisi"], ["reject", "Tolak"], ["archive", "Arsipkan"]].map(([action, label]) => <button type="button" key={action} disabled={busy} onClick={() => void act(action)}>{label}</button>)}</div><p role="status">{message}</p><small>Publikasi/review/arsip memerlukan administrator. Server memvalidasi status dan versi.</small></div>;
}
