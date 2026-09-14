import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["lelang.carubra.com"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
