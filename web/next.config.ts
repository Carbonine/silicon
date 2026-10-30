import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const backend = (process.env.BACKEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

// Everything the Express backend owns. The first two are the proxy traffic; the rest are the Scramjet and
// transport bundles, the game and icon APIs, and the files shared with the old frontend (one copy of each).
const FORWARDED = ["/proxy/:path*", "/wisp/:path*", "/scram/:path*", "/epoxy/:path*", "/libcurl/:path*", "/api/:path*", "/vendor/:path*", "/css/:path*", "/js/:path*"];

const root = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  // web/ is its own project; the lockfile one level up belongs to the backend.
  outputFileTracingRoot: root,
  turbopack: { root },
  // Proxied URLs contain encoded URLs: never let Next tidy them with a redirect.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return {
      // beforeFiles: these paths must never fall through to a Next route.
      beforeFiles: [
        { source: "/wisp/", destination: `${backend}/wisp/` }, // keeps its trailing slash, which :path* below would drop
        ...FORWARDED.map((source) => ({ source, destination: `${backend}${source}` })),
        { source: "/proxy-config.json", destination: `${backend}/proxy-config.json` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{
      // public/sw.js is served as a plain static file. Root scope, and never cached, so updates reach the browser.
      source: "/sw.js",
      headers: [
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Type", value: "text/javascript; charset=utf-8" },
      ],
    }];
  },
};

export default config;
