/**
 * Simple in-memory rate limiter (per-instance, per-serverless-function)
 *
 * Untuk production high-traffic, sebaiknya gunakan Upstash Redis rate limit.
 * Tapi untuk Vercel free/hobby plan, ini cukup memadai untuk block brute-force.
 *
 * Strategy: sliding window per IP
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup expired entries setiap 5 menit
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const keysToDelete: string[] = [];
  store.forEach((entry, key) => {
    if (entry.resetAt < now) keysToDelete.push(key);
  });
  keysToDelete.forEach((key) => store.delete(key));
}

/**
 * Check rate limit untuk key (biasanya IP + endpoint).
 * Returns { allowed, remaining, resetAtMs }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAtMs: number } {
  cleanup();

  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    // First request atau window expired
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAtMs: now + windowMs };
  }

  existing.count++;

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, resetAtMs: existing.resetAt };
  }

  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAtMs: existing.resetAt,
  };
}

/**
 * Get client IP dari request (melewati Vercel proxy)
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Rate limit untuk public shared report endpoint
 * - 60 request per 5 menit per IP (cukup untuk normal use)
 */
export function checkPublicReportRateLimit(ip: string) {
  return checkRateLimit(`public-report:${ip}`, 60, 5 * 60 * 1000);
}