import type { NextConfig } from "next";

// script-src dan style-src masih butuh 'unsafe-inline': Next.js menyuntik script bootstrap/hydration
// inline dan komponen memakai prop style={{...}} React (grafik dashboard, background foto). Menghapus
// 'unsafe-inline' butuh plumbing nonce per-request yang belum ada — jangan hapus sebelum itu dikerjakan.
// 'unsafe-eval' HANYA untuk `next dev`: React mode development memakai eval() untuk rekonstruksi
// callstack dan HMR. Build produksi tidak pernah memakai eval(), jadi jangan longgarkan di sana.
// frame-src mengizinkan embed peta Google pada detail properti dan form properti.
// Sisanya dikunci ke origin sendiri: foto disajikan lewat /api/v1/media/*, font di-selfhost next/font.
const scriptSource = process.env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = [
  "default-src 'self'",
  scriptSource,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Image Docker produksi hanya menyalin .next/standalone, .next/static, dan public/ sehingga
  // devDependencies tidak ikut ke runtime. Tidak berpengaruh pada `next dev`.
  output: "standalone",
  allowedDevOrigins: [
    "lelang.carubra.com",
    "lelanganproperti.my.id",
    "lelangproperti.com",
    "lelangproperti.id",
    "lelangproperti.net",
    "lelangproperti.org",
    "localhost:3003",
    "10.10.10.102:3003",
  ],
  turbopack: { root: process.cwd() },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        // Diabaikan browser bila dikirim lewat HTTP (spesifikasi HSTS), jadi aman untuk dev localhost.
        // TLS diakhiri tunnel/reverse proxy; header ini memastikan browser tidak turun ke HTTP lagi.
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
