import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  // Keep the development interface clear; runtime and compile errors still surface.
  devIndicators: false,
  serverExternalPackages: ["playwright", "playwright-core"],
  // Runtime receipts, local account evidence and credentials are never build assets.
  outputFileTracingExcludes: { "/*": ["./.local/**/*", "./.env*"] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      // Compile the Tailwind entry only; preserve native CSS Module class exports.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
