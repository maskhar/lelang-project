import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "lelang.carubra.com",
    "lelanganproperti.my.id",
    "lelangproperti.com",
    "lelangproperti.id",
    "lelangproperti.net",
    "lelangproperti.org",
    "localhost:3003",
  ],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
