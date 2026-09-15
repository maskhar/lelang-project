"use client";
import { useRef, useState } from "react";
import { apiRequest } from "./api-client";
import { csrfHeaders } from "./csrf";
import { FormError } from "./form-error";

export default function PropertyAvailability({ id, version, onChanged }: { id: string; version: number; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const locked = useRef(false);
  return <form onSubmit={async (event) => {
    event.preventDefault();
    if (locked.current || !window.confirm("Tandai properti terjual? Form minat publik akan ditutup. Lanjutkan hanya setelah penjualan dikonfirmasi.")) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      await apiRequest("/api/v1/properties/" + id + "/availability", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version, reason }) });
      await onChanged();
    } catch (failure) { setError(failure); }
    finally { locked.current = false; setBusy(false); }
  }}><fieldset disabled={busy}><legend>Status penjualan · khusus admin</legend><label>Alasan konfirmasi terjual <input required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="submit">{busy ? "Menyimpan…" : "Tandai terjual"}</button></fieldset><FormError error={error} /></form>;
}
