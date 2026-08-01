import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

type CookieOptions = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

/**
 * GET /auth/callback
 * Handles OAuth callback from Google (and other providers).
 * Exchanges code for session, then redirects to the original target.
 *
 * URL pattern: /auth/callback?code=xxx&redirect=/dashboard
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirectPath = requestUrl.searchParams.get("redirect") || "/";

  if (!code) {
    console.error("[Auth Callback] No code provided");
    return NextResponse.redirect(new URL("/login?error=auth_no_code", requestUrl.origin));
  }

  const supabaseResponse = NextResponse.redirect(
    new URL(redirectPath, requestUrl.origin)
  );

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieOptions[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          );
        },
      },
    }
  );

  try {
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      console.error("[Auth Callback] Session exchange failed:", error?.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error?.message || "auth_failed")}`, requestUrl.origin)
      );
    }

    console.log("[Auth Callback] ✅ Session established for user:", data.user.email);

    // Profile auto-created via DB trigger (handle_new_user)
    // Onboarding check will be handled by middleware (division IS NULL → /onboarding)

    return supabaseResponse;
  } catch (err) {
    console.error("[Auth Callback] Unexpected error:", err);
    return NextResponse.redirect(
      new URL("/login?error=auth_unexpected", requestUrl.origin)
    );
  }
}