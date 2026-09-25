import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import ChatwootWidget from "@/components/chatwoot-widget";
import { getChatwootConfig } from "@/server/chatwoot";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700"] });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["500"] });

export const metadata: Metadata = {
  title: "Lelang Properti — Aset Tepercaya, Proses Transparan",
  description: "Prototype platform lelang dan jual beli properti.",
  icons: {
    icon: [
      { url: "/image/logo/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/image/logo/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/image/logo/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    shortcut: "/image/logo/favicon/favicon.ico",
    apple: { url: "/image/logo/favicon/apple-icon-180x180.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Widget chat dibaca di sini (server) lalu dialirkan sebagai props; null = dimatikan lewat env dan
  // tidak ada skrip pihak ketiga yang disuntik sama sekali. Ditaruh di root layout supaya bubble-nya
  // ikut ke dashboard juga — percakapan yang sudah berjalan tidak putus saat pengunjung login.
  const chatwoot = getChatwootConfig();
  return <html lang="id"><body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>{children}{chatwoot && <ChatwootWidget config={chatwoot} />}</body></html>;
}
