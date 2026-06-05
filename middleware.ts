import { NextRequest, NextResponse } from "next/server";
import { isPlatformHost, resolveCustomHost, customHostTarget } from "@/lib/domains/host";
import { getDomainSlug } from "@/lib/domains/edge-cache";

/**
 * Per-request nonce-based Content-Security-Policy.
 *
 * A fresh nonce is generated for each request and placed in the CSP. Next.js
 * reads the nonce from the request-side CSP header and stamps it onto every
 * script tag it emits; `app/layout.tsx` stamps it onto the inline theme
 * script. `'strict-dynamic'` then lets those trusted scripts load the rest of
 * the bundle, so no `'unsafe-inline'` is needed for scripts.
 *
 * `style-src` keeps `'unsafe-inline'` — the app uses inline `style` attributes
 * throughout and Tailwind injects styles; style injection is low-risk.
 */
export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    `default-src 'self'`,
    // 'unsafe-eval' is only needed in dev for React Fast Refresh / HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  // Next.js reads the nonce from the request-side CSP header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const platformHost = process.env.PLATFORM_HOST ?? null;

  // Custom-domain vanity hosting: a non-platform host serves that account's home
  // ("/") and CV ("/cv") in place. The namespaced /api/a/{slug}/* calls are
  // excluded from middleware and resolve by path. The first `customHostTarget`
  // call is a cheap membership check that avoids a KV lookup on non-vanity paths.
  if (!isPlatformHost(host, platformHost) && customHostTarget(request.nextUrl.pathname, "") !== null) {
    const slug = await resolveCustomHost(host, getDomainSlug);
    const dest = slug ? customHostTarget(request.nextUrl.pathname, slug) : null;
    if (dest) {
      const url = request.nextUrl.clone();
      url.pathname = dest;
      const rewrite = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      rewrite.headers.set("content-security-policy", csp);
      return rewrite;
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

// Run on every page route — skip API routes, Next.js internals, and static
// assets, none of which render the HTML document the CSP protects.
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
