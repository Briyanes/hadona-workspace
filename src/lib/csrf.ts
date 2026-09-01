/**
 * CSRF Protection Utility for Next.js App Router API routes.
 *
 * Uses the "Origin Header Validation" strategy — the modern, stateless
 * approach recommended by OWASP for SameSite-cookie-based auth.
 *
 * How it works:
 * 1. For mutation requests (POST, PUT, PATCH, DELETE), check the Origin
 *    or Referer header against the expected application domain.
 * 2. If the header is missing or doesn't match → reject as CSRF attempt.
 * 3. This is sufficient because browsers always send Origin/Referer on
 *    cross-origin requests, and Supabase auth uses httpOnly cookies.
 *
 * @example
 * // Inside an API route:
 * const csrfError = validateCsrf(request);
 * if (csrfError) return csrfError;
 */

import { NextResponse, type NextRequest } from "next/server";

/**
 * Get the expected origin domain from environment variables.
 * Falls back to vercel/localhost if not explicitly set.
 */
function getExpectedOrigin(): string[] {
  const origins: string[] = [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (appUrl) origins.push(appUrl);

  // Vercel auto-injects these
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  // Local dev
  origins.push("http://localhost:3000");

  // Normalize: remove trailing slash, deduplicate
  return Array.from(new Set(origins.map((o) => o.replace(/\/$/, ""))));
}

/**
 * Check whether the given origin/referer URL belongs to the same host
 * the request was served on (including port). Same-origin requests are
 * inherently trusted — browsers cannot spoof Origin cross-site.
 */
function isSameOrigin(url: string | URL, request: NextRequest): boolean {
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    const requestHost = request.headers.get("host");
    return !!requestHost && parsed.host === requestHost;
  } catch {
    return false;
  }
}

/**
 * Validate CSRF for mutation requests (POST, PUT, PATCH, DELETE).
 *
 * Returns a NextResponse (403) if the request fails CSRF validation,
 * or null if the request is safe to proceed.
 *
 * Safe methods (GET, HEAD, OPTIONS) always pass — they should be read-only.
 */
export function validateCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF checks
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  const expectedOrigins = getExpectedOrigin();

  // Check Origin header (primary)
  if (origin) {
    const isAllowed =
      isSameOrigin(origin, request) ||
      expectedOrigins.some(
        (expected) => origin === expected || origin.startsWith(expected + ".")
      );
    if (!isAllowed) {
      return NextResponse.json(
        { success: false, error: "CSRF_VALIDATION_FAILED", message: "Origin not allowed" },
        { status: 403 }
      );
    }
    return null; // Origin matched, request is safe
  }

  // Fallback: Check Referer header (if Origin is missing)
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const isAllowed =
        isSameOrigin(refererUrl, request) ||
        expectedOrigins.some(
          (expected) =>
            refererUrl.origin === expected ||
            refererUrl.origin.startsWith(expected + ".")
        );
      if (!isAllowed) {
        return NextResponse.json(
          { success: false, error: "CSRF_VALIDATION_FAILED", message: "Referer not allowed" },
          { status: 403 }
        );
      }
      return null; // Referer matched
    } catch {
      return NextResponse.json(
        { success: false, error: "CSRF_VALIDATION_FAILED", message: "Invalid referer" },
        { status: 403 }
      );
    }
  }

  // No Origin and no Referer on a mutation request — suspicious.
  // Allow only if it's a server-to-server call (e.g., cron with secret).
  // - Authorization header: presence check only (the actual value/JWT is
  //   verified by route handlers via verifyCronSecret or Supabase auth).
  // - x-cron-secret: value MUST match CRON_SECRET (fail-closed). Previously
  //   mere header presence bypassed CSRF — any junk value could skip the check.
  const authHeader = request.headers.get("authorization");
  const cronSecret = request.headers.get("x-cron-secret");
  const cronSecretValid =
    !!cronSecret && !!process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (authHeader || cronSecretValid) {
    return null; // Server-to-server, skip CSRF
  }

  return NextResponse.json(
    { success: false, error: "CSRF_VALIDATION_FAILED", message: "Missing Origin/Referer header" },
    { status: 403 }
  );
}