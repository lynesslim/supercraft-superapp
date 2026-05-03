import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    proxyClientMaxBodySize: "96mb",
  },
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
