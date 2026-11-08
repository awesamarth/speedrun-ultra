import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Read-only cache from build-time assets (only static files like /_not-found use it). All data is dynamic (D1).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
