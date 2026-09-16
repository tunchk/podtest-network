import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse depends on pdfjs-dist workers/native paths that break when Turbopack
  // bundles them into the route handler. Keep them external so Node resolves them.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
