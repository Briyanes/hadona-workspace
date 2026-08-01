/**
 * Centralized API authentication & authorization helpers
 *
 * Usage in API routes:
 *
 *   import { getAuthenticatedUser, requireAdmin } from "@/lib/auth-api";
 *
 *   export async function POST(request: NextRequest) {
 *     const auth = await getAuthenticatedUser(request);
 *     if (!auth.user) return auth.error!;  // 401 response
 *
 *     const { user, supabase } = auth;
 *     // ... your logic
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import type { User } from "@supabase/supabase-js";

const ADMIN_ROLES = ["super_admin", "project_manager"];

export interface AuthResult {
  user: User | null;
  supabase: ReturnType<typeof createClient>;
  error: NextResponse | null;
}

/**
 * Verify the request has a valid authenticated session.
 * Returns user + supabase client, or a 401 error response.
 */
export async function getAuthenticatedUser(
  _request: NextRequest
): Promise<AuthResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      supabase,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { user, supabase, error: null };
}

/**
 * Require the user to have an admin role (super_admin or project_manager).
 * Returns user + supabase + profile, or a 403 error response.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<
  | { user: User; supabase: ReturnType<typeof createClient>; profile: { role: string }; error: null }
  | { user: null; supabase: null; profile: null; error: NextResponse }
> {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user || auth.error) {
    return { user: null, supabase: null, profile: null, error: auth.error! };
  }

  const { data: profileData } = await auth.supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", auth.user.id)
    .single();

  const profile = profileData as { role: string; is_active: boolean } | null;

  if (!profile?.is_active || !ADMIN_ROLES.includes(profile.role)) {
    return {
      user: null,
      supabase: null,
      profile: null,
      error: NextResponse.json(
        { error: "Forbidden — admin access required" },
        { status: 403 }
      ),
    };
  }

  return { user: auth.user, supabase: auth.supabase, profile: { role: profile.role }, error: null };
}

/**
 * Apply rate limiting to a mutation endpoint.
 * Default: 30 requests per minute per IP.
 */
export function applyRateLimit(
  request: NextRequest,
  endpoint: string,
  limit: number = 30,
  windowMs: number = 60 * 1000
): NextResponse | null {
  const ip = getClientIP(request);
  const { allowed, resetAtMs } = checkRateLimit(`api:${endpoint}:${ip}`, limit, windowMs);

  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAtMs),
          "Retry-After": String(Math.ceil((resetAtMs - Date.now()) / 1000)),
        },
      }
    );
  }

  return null;
}