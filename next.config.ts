import type { NextConfig } from "next";
import path from "path";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: projectRoot,
  allowedDevOrigins: ["127.0.0.1", "*.127.0.0.1", "localhost", "*.localhost"],
  experimental: {
    proxyClientMaxBodySize: "96mb",
  },
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
