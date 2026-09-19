"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";
import { FormError } from "@/components/form-error";
import styles from "../dashboard-shell.module.css";

type Config = { url: string; enabled: boolean; hasSecret: boolean; updatedAt: string | null };
type TestResult = { ok: boolean; status: number | null; latencyMs: number; error?: string; bodySnippet?: string; payloadSent: Record<string, unknown> };
const timestamp = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export default function Page() {
  const [config, setConfig] = useState<Config | null>(null);
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [rotating, setRotating] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState("");
  const [revealedSecret, setRevealedSecret] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mutationLock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<Config>("/api/v1/admin/webhooks", { cache: "no-store", signal: controller.signal })
      .then((data) => { setConfig(data); setUrl(data.url); setEnabled(data.enabled); setError(null); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const reload = () => { setLoading(true); setNotice(""); setRefresh((value) => value + 1); };

  async function mutate(run: () => Promise<void>) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setNotice(""); setError(null);
    try { await run(); }
    catch (reason) { setError(reason); }
    finally { mutationLock.current = false; setBusy(false); }
  }
  const save = () => mutate(async () => {
    const data = await apiRequest<Config>("/api/v1/admin/webhooks", { method: "PATCH", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ url: url.trim(), enabled }) });
    setConfig(data); setUrl(data.url); setEnabled(data.enabled); setNotice("Konfigurasi webhook disimpan.");
  });
  // Secret baru menggantikan yang lama seketika: n8n akan menolak tanda tangan sampai nilai ini dipasang di sana.
  const rotate = () => mutate(async () => {
    const data = await apiRequest<{ secret: string }>("/api/v1/admin/webhooks/secret", { method: "POST", headers: await csrfHeaders() });
    setRevealedSecret(data.secret); setRotateConfirm(""); setRotating(false); setNotice("Secret baru dibuat. Salin sekarang — nilai ini tidak akan ditampilkan lagi.");
    setConfig((current) => (current ? { ...current, hasSecret: true } : current));
  });
  const fireTest = () => mutate(async () => {
    setResult(null);
    const data = await apiRequest<TestResult>("/api/v1/admin/webhooks/test", { method: "POST", headers: await csrfHeaders() });
    setResult(data); setNotice(data.ok ? "Webhook contoh terkirim." : "Webhook contoh gagal terkirim — lihat detail di bawah.");
  });

  return <>
    <div className={styles.heading}>
      <div>
        <h1>Webhook</h1>
        <p>Kirim setiap lead baru ke n8n sebagai POST JSON. Payload berisi kontak asli pemohon (nama, email, telepon, pesan) beserta data properti, jadi pastikan endpoint tujuan aman.</p>
      </div>
      <div className={styles.actions}><button type="button" disabled={loading || busy} onClick={reload}>Muat ulang</button></div>
    </div>

    <FormError error={error} />
    {notice && <p className={styles.notice} role="status">{notice}</p>}

    {loading ? <p className={styles.empty}>Memuat konfigurasi…</p> : <div className={styles.grid}>
      <section className={styles.panel}>
        <h2>Endpoint</h2>
        <p>URL Webhook node di n8n. Skema http/https; host lokal atau jaringan internal diizinkan. Redirect tidak diikuti.</p>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <fieldset>
            <label className={styles.full}>URL webhook
              <input type="url" value={url} maxLength={2000} required placeholder="https://n8n.contoh.id/webhook/lead" onChange={(event) => setUrl(event.target.value)} />
            </label>
            <label className={styles.full}>
              <span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Aktifkan pengiriman otomatis</span>
              <small>Saat nonaktif, lead tetap tersimpan dan muncul di dashboard, tapi tidak ada event webhook yang diantre.</small>
            </label>
          </fieldset>
          <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button></div>
        </form>
        {config?.updatedAt && <p><small>Terakhir diubah {timestamp(config.updatedAt)}.</small></p>}
      </section>

      <section className={styles.panel}>
        <h2>Secret tanda tangan</h2>
        <p>Setiap request membawa header <code>X-Lelang-Timestamp</code> dan <code>X-Lelang-Signature</code> berisi <code>sha256=HMAC-SHA256(secret, timestamp + &quot;.&quot; + body)</code>. Verifikasi nilai itu di n8n dan tolak timestamp yang sudah basi.</p>
        <p>Status: <strong>{config?.hasSecret ? "Sudah dibuat" : "Belum dibuat"}</strong></p>
        {revealedSecret && <div className={styles.confirmBox}>
          <p><strong>Salin secret ini sekarang.</strong> Server hanya menyimpan versi terenkripsi dan tidak bisa menampilkannya lagi.</p>
          <p><code style={{ overflowWrap: "anywhere" }}>{revealedSecret}</code></p>
          <div className={styles.actions}>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(revealedSecret).then(() => setNotice("Secret disalin ke clipboard.")).catch(() => setNotice("Gagal menyalin otomatis — salin manual."))}>Salin</button>
            <button type="button" onClick={() => setRevealedSecret("")}>Sembunyikan</button>
          </div>
        </div>}
        {rotating ? <div role="alertdialog" aria-labelledby="rotate-secret-title" className={styles.confirmBox}>
          <p id="rotate-secret-title"><strong>{config?.hasSecret ? "Ganti secret webhook?" : "Buat secret webhook?"}</strong> {config?.hasSecret && "Secret lama langsung tidak berlaku dan n8n akan menolak request sampai nilai baru dipasang di sana."}</p>
          <label>Ketik <b>GANTI</b> untuk mengaktifkan tombol <input value={rotateConfirm} maxLength={10} autoFocus aria-label="Konfirmasi ketik GANTI" onChange={(event) => setRotateConfirm(event.target.value)} /></label>
          <div className={styles.actions}>
            <button type="button" className={styles.dangerBtn} disabled={busy || rotateConfirm.trim() !== "GANTI"} onClick={() => void rotate()}>{busy ? "Membuat…" : "Buat secret baru"}</button>
            <button type="button" disabled={busy} onClick={() => { setRotating(false); setRotateConfirm(""); }}>Batal</button>
          </div>
        </div> : <div className={styles.actions}><button type="button" disabled={busy} onClick={() => { setRotating(true); setRotateConfirm(""); }}>{config?.hasSecret ? "Putar secret" : "Buat secret"}</button></div>}
      </section>

      <section className={styles.panel}>
        <h2>Uji webhook</h2>
        <p>Menembakkan payload contoh (<code>test: true</code>) dengan bentuk persis sama seperti lead asli, supaya field bisa dipetakan di n8n sambil melihat execution log. Tidak membuat lead dan tidak lewat antrean worker.</p>
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || !config?.hasSecret || !config?.url} onClick={() => void fireTest()}>{busy ? "Mengirim…" : "Kirim contoh webhook"}</button></div>
        {!config?.hasSecret && <p><small>Simpan URL dan buat secret terlebih dahulu.</small></p>}
        {result && <div className={styles.grid}>
          <p>
            <span className={styles.badge} data-status={result.ok ? "processed" : "dead_letter"}>{result.ok ? "Berhasil" : "Gagal"}</span>{" "}
            HTTP {result.status ?? "—"} · {result.latencyMs} ms
          </p>
          {result.error && <p className={styles.error}>{result.error}</p>}
          {result.bodySnippet && <><p><small>Balasan endpoint:</small></p><pre style={{ overflowX: "auto", fontSize: 12 }}>{result.bodySnippet}</pre></>}
          <p><small>Payload yang dikirim:</small></p>
          <pre style={{ overflowX: "auto", fontSize: 12 }}>{JSON.stringify(result.payloadSent, null, 2)}</pre>
        </div>}
      </section>
    </div>}
  </>;
}
