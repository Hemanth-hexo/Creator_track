import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Next.js server proxies /api/* to the real API (Render in production,
// localhost in dev) so the browser only ever talks to ONE origin. This
// matters because the API's session cookie is host-only: if the browser
// called the API's real domain directly, the cookie would belong to that
// domain and this app's own login-check could never see it. Proxying keeps
// everything looking same-origin from the browser's point of view, exactly
// like local dev (where both happened to be "localhost").
const API_PROXY_TARGET = process.env.API_PROXY_TARGET || "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_PROXY_TARGET}/api/:path*` }];
  },
};

export default nextConfig;
