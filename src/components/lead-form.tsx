"use client";
import { useState, type FormEvent } from "react";

export default function LeadForm({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setMessage("");
    try {
      const csrf = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
      const token = csrf.headers.get("x-csrf-token");
      if (!csrf.ok || !token) throw new Error("Gagal menyiapkan formulir. Coba lagi.");
      const response = await fetch("/api/v1/leads", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ propertyId, name: fields.get("name"), email: fields.get("email") || undefined, phone: fields.get("phone") || undefined, message: fields.get("message"), consent: fields.get("consent") === "on" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gagal mengirim minat.");
      form.reset(); setMessage("Minat berhasil dikirim. Tim akan menindaklanjuti melalui kontak yang Anda isi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal mengirim minat."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><fieldset disabled={busy}><legend>Kirim minat — bukan penawaran lelang</legend><p><label>Nama <input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label></p><p><label>Email <input name="email" type="email" maxLength={320} autoComplete="email" /></label></p><p><label>Telepon <input name="phone" type="tel" maxLength={30} autoComplete="tel" /></label></p><p>Isi setidaknya email atau telepon.</p><p><label>Pesan <textarea name="message" maxLength={2000} /></label></p><p><label><input name="consent" type="checkbox" required /> Saya menyetujui penggunaan kontak untuk menindaklanjuti minat properti ini.</label></p><button className="button dark" disabled={busy}>{busy ? "Mengirim…" : "Kirim minat"}</button></fieldset><p role="status">{message}</p></form>;
}
