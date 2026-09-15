"use client";
import { useState, useSyncExternalStore } from "react";
import styles from "./property-detail.module.css";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("property-saved", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("property-saved", listener); };
}
function ActionIcon({ name }: { name: "save" | "share" | "brochure" }) {
  const paths = { save: <path d="M20 21l-8-5-8 5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16Z" />, share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" /></>, brochure: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></> };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export default function PropertyActions({ id, title }: { id: number | string; title: string }) {
  const saved = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem("saved-property-" + id) === "true"; } catch { return false; } }, () => false);
  const [message, setMessage] = useState("");
  function toggle() { try { localStorage.setItem("saved-property-" + id, String(!saved)); window.dispatchEvent(new Event("property-saved")); setMessage(saved ? "Aset dihapus dari simpanan browser ini." : "Aset disimpan di browser ini."); } catch { setMessage("Gagal menyimpan. Periksa izin penyimpanan browser."); } }
  async function share() { try { if (navigator.share) await navigator.share({ title, url: window.location.href }); else { await navigator.clipboard.writeText(window.location.href); setMessage("Tautan aset disalin."); } } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("Gagal membagikan. Salin alamat halaman dari browser."); } }
  return <div className={styles.assetActions}><div><button type="button" aria-pressed={saved} onClick={toggle}><ActionIcon name="save" />{saved ? "Tersimpan" : "Simpan"}</button><button type="button" onClick={share}><ActionIcon name="share" />Bagikan</button><button type="button" onClick={() => window.print()}><ActionIcon name="brochure" />Brosur</button></div><p role="status">{message || "Brosur: cetak atau simpan sebagai PDF melalui browser."}</p></div>;
}
