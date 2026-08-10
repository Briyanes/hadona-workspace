/**
 * 🔒 Strict CRON secret verification helper
 *
 * Security model: **fail-closed**
 * - If CRON_SECRET is not set → REJECT (status 500, config error)
 * - If Authorization header doesn't match → REJECT (status 401)
 * - If both correct → ALLOW
 *
 * This prevents the vulnerability where cron routes become publicly
 * accessible when CRON_SECRET env var is accidentally not set.
 */

import { NextRequest, NextResponse } from "next/server";

export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  // 🔒 Fail-closed: CRON_SECRET MUST be configured
  if (!cronSecret) {
    console.error(
      "[CRON-AUTH] 🚨 CRITICAL: CRON_SECRET env var is not set! Cron endpoint blocked for security."
    );
    return NextResponse.json(
      {
        error: "Server misconfigured: CRON_SECRET is not set",
      },
      { status: 500 }
    );
  }

  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get("authorization");
  const expectedHeader = `Bearer ${cronSecret}`;

  if (authHeader !== expectedHeader) {
    // Also check Vercel's native cron auth (for Vercel Cron Jobs)
    // Vercel sends the secret as `Authorization: Bearer <secret>`
    // Already covered above. No additional check needed.
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null; // ✅ Authorized
}