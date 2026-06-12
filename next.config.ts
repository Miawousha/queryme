import type { NextConfig } from "next";

// Baseline security headers applied to every response. A full Content-Security-
// Policy is intentionally omitted — it needs per-deployment tuning for the
// inline theme script and the Next.js runtime — but these are safe and universal.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingIncludes: {
    "/setup-guide.md": [
      "./docs/agent-setup-preamble.md",
      "./docs/content-repo-guide.md",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
