"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError, apiRequest } from "./api-client";
import { csrfHeaders } from "./csrf";

export default function LeadForm({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [contactError, setContactError] = useState("");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = window.setTimeout(() => setRetrySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || retrySeconds > 0) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") || "").trim();
    const phone = String(fields.get("phone") || "").trim();
    setError(""); setMessage(""); setContactError("");
    if (!email && !phone) {
      setContactError("Isi setidaknya email atau telepon.");
      form.querySelector<HTMLInputElement>('[name="email"]')?.focus();
      return;
    }
    lock.current = true; setBusy(true);
    try {
      await apiRequest("/api/v1/leads", { method: "POST", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ propertyId, name: String(fields.get("name") || "").trim(), email: email || undefined, phone: phone || undefined, message: String(fields.get("message") || "").trim(), consent: fields.get("consent") === "on" }) });
      form.reset(); setMessage("Minat berhasil dikirim. Tim akan menindaklanjuti melalui kontak yang Anda isi. Ini bukan penawaran lelang atau pembayaran.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Gagal mengirim minat.");
      if (failure instanceof ApiClientError && failure.status === 429) setRetrySeconds(Math.ceil(failure.retryAfter || 60));
    } finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}><legend>Kirim minat — bukan penawaran lelang</legend><p><label>Nama <input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label></p><p><label>Email <input name="email" type="email" maxLength={320} autoComplete="email" aria-invalid={Boolean(contactError)} aria-describedby="lead-contact-help" onChange={() => setContactError("")} /></label></p><p><label>Telepon <input name="phone" type="tel" pattern="[+0-9 ()\-]{6,30}" maxLength={30} autoComplete="tel" aria-invalid={Boolean(contactError)} aria-describedby="lead-contact-help" onChange={() => setContactError("")} /></label></p><p id="lead-contact-help">{contactError || "Isi setidaknya email atau telepon."}</p><p><label>Pesan <textarea name="message" maxLength={2000} /></label></p><p><label><input name="consent" type="checkbox" required /> Saya menyetujui penggunaan kontak untuk menindaklanjuti minat properti ini.</label></p><button className="button dark" disabled={busy || retrySeconds > 0}>{busy ? "Mengirim…" : retrySeconds > 0 ? "Coba lagi dalam " + retrySeconds + " detik" : "Kirim minat"}</button></fieldset>{error && <p role="alert">{error}</p>}<p role="status">{message}</p></form>;
}
