import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Build output must sit under node_modules: the repository's pinned security
  // scanner skips node_modules but scans every other .js/.json file in the tree.
  distDir: "node_modules/.studio-next",
  transpilePackages: ["@workspace/ui", "@workspace/core", "@workspace/vnccs"],
  turbopack: {
    resolveAlias: {
      sharp: { browser: "./src/lib/node-only.ts" },
      ws: { browser: "./src/lib/node-only.ts" },
    },
  },
};

export default nextConfig;
