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

// Track blocked attempts for admin dashboard
interface BlockedAttempt {
  key: string;
  ip: string;
  endpoint: string;
  timestamp: number;
}
const blockedAttempts: BlockedAttempt[] = [];
const MAX_BLOCKED_HISTORY = 200;

/**
 * Get rate limit stats for admin dashboard (per-instance snapshot)
 */
export function getRateLimitStats() {
  const now = Date.now();
  const activeEntries: Array<{ key: string; count: number; resetAt: number }> =
    [];
  let totalActive = 0;
  let nearLimit = 0;

  store.forEach((entry, key) => {
    if (entry.resetAt > now) {
      totalActive++;
      activeEntries.push({ key, ...entry });
      if (entry.count > 5) nearLimit++;
    }
  });

  // Group blocked by endpoint
  const endpointStats: Record<string, number> = {};
  const ipStats: Record<string, number> = {};
  const recentBlocked = blockedAttempts.slice(-50);

  for (const attempt of recentBlocked) {
    endpointStats[attempt.endpoint] =
      (endpointStats[attempt.endpoint] || 0) + 1;
    ipStats[attempt.ip] = (ipStats[attempt.ip] || 0) + 1;
  }

  return {
    totalActiveKeys: totalActive,
    nearLimitKeys: nearLimit,
    recentBlockedCount: blockedAttempts.length,
    topBlockedEndpoints: Object.entries(endpointStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count })),
    topBlockedIps: Object.entries(ipStats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count })),
    recentBlocked,
  };
}

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
    // Record blocked attempt for admin dashboard
    const parts = key.split(":");
    blockedAttempts.push({
      key,
      ip: parts[1] || "unknown",
      endpoint: parts[0] || "unknown",
      timestamp: now,
    });
    // Trim history
    if (blockedAttempts.length > MAX_BLOCKED_HISTORY) {
      blockedAttempts.splice(0, blockedAttempts.length - MAX_BLOCKED_HISTORY);
    }
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

/**
 * Rate limit untuk auth endpoints (login/signup)
 * - 5 attempts per 15 menit per IP (mencegah brute-force)
 * - Setelah 5x gagal, IP diblok selama 15 menit
 */
export function checkAuthRateLimit(ip: string) {
  return checkRateLimit(`auth:${ip}`, 5, 15 * 60 * 1000);
}

/**
 * Rate limit untuk API mutations (POST/PUT/DELETE)
 * - 30 request per menit per IP (mencegah spam/abuse)
 */
export function checkMutationRateLimit(ip: string) {
  return checkRateLimit(`mutation:${ip}`, 30, 60 * 1000);
}
