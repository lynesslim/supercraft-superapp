import type { NextConfig } from "next";
import path from "path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  experimental: {
    proxyClientMaxBodySize: "96mb",
  },
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
