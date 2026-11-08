import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are off: OpenNext on Workers serves the PPR shell without
// resuming the dynamic part. Every page here reads live D1 data, so plain dynamic rendering is right.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
