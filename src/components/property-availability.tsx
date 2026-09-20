"use client";
import { useRef, useState } from "react";
import { apiRequest } from "./api-client";
import { csrfHeaders } from "./csrf";
import { FormError } from "./form-error";
import styles from "@/app/dashboard/dashboard.module.css";

// availabilityStatus terpisah dari publicationStatus: properti tetap "published" saat terjual, hanya form
// minat publik yang ditutup. Arah sebaliknya ("available") disediakan untuk memperbaiki salah tandai.
export default function PropertyAvailability({ id, version, availabilityStatus, onChanged }: { id: string; version: number; availabilityStatus: string; onChanged: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const locked = useRef(false);
  const sold = availabilityStatus === "sold";

  async function submit() {
    if (locked.current || busy) return;
    if (reason.trim().length < 3) {
      setError(new Error(sold ? "Alasan pengembalian status minimal 3 karakter." : "Alasan konfirmasi terjual minimal 3 karakter."));
      return;
    }
    if (!window.confirm(sold ? "Kembalikan properti ke status tersedia? Form minat publik akan dibuka kembali." : "Tandai properti terjual? Form minat publik akan ditutup. Lanjutkan hanya setelah penjualan dikonfirmasi.")) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      await apiRequest("/api/v1/properties/" + id + "/availability", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ version, reason: reason.trim(), ...(sold ? { action: "available" } : {}) }) });
      setReason("");
      await onChanged();
    } catch (failure) { setError(failure); }
    finally { locked.current = false; setBusy(false); }
  }

  // Tanpa atribut `required`: komponen ini dirender lewat statusActions, yang berada di dalam <form> editor
  // listing (property-form.tsx). Field wajib-isi yang kosong di situ membuat browser memblokir submit form
  // utama tanpa pesan apa pun — jadi "Simpan draft" mati diam begitu properti berstatus published. Panjang
  // minimal alasan tetap divalidasi di submit() di atas.
  return <div className={styles.propertyAvailability}><fieldset disabled={busy}><legend>Status penjualan · khusus admin</legend><p>{sold ? "Properti ditandai terjual — form minat publik tertutup." : "Properti tersedia — form minat publik terbuka."}</p><label>{sold ? "Alasan kembalikan tersedia" : "Alasan konfirmasi terjual"} <input minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" onClick={() => void submit()}>{busy ? "Menyimpan…" : sold ? "Kembalikan tersedia" : "Tandai terjual"}</button></fieldset><FormError error={error} /></div>;
}
