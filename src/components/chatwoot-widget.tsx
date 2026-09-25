"use client";
import Script from "next/script";
import type { ChatwootConfig } from "@/lib/chatwoot";

declare global {
  interface Window {
    chatwootSDK?: { run: (options: { websiteToken: string; baseUrl: string }) => void };
    /** Penanda bahwa run() sudah dipanggil; mencegah widget ganda saat onLoad terpanggil ulang. */
    __chatwootRan?: boolean;
  }
}

// Padanan snippet <script> bawaan Chatwoot, ditulis lewat next/script supaya Next yang mengatur kapan
// skripnya dimuat. strategy afterInteractive: widget chat tidak boleh bersaing dengan hidrasi katalog
// dan foto properti di jalur render awal — snippet mentah menyisipkan <script async> ke <head> dan
// mendahului itu.
//
// config dialirkan sebagai props dari layout (server component); lihat src/server/chatwoot.ts.
export default function ChatwootWidget({ config }: { config: ChatwootConfig }) {
  return <Script
    id="chatwoot-sdk"
    src={config.baseUrl + "/packs/js/sdk.js"}
    strategy="afterInteractive"
    // Dijaga: run() hanya sekali. next/script sudah menjamin satu kali muat per id, tapi onLoad bisa
    // terpanggil ulang saat HMR di dev, dan run() kedua kali membuat widget ganda.
    onLoad={() => { if (!window.__chatwootRan) { window.__chatwootRan = true; window.chatwootSDK?.run({ websiteToken: config.websiteToken, baseUrl: config.baseUrl }); } }}
  />;
}
