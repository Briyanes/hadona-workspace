import { NextRequest, NextResponse } from "next/server";
import { getMetaAuthUrl } from "@/lib/meta";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/meta/auth
 * Initiates Meta OAuth flow — redirects user to Facebook login
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build redirect URI (must match what's set in Meta App settings)
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/meta/callback`;

    // State = user_id for security (prevent CSRF)
    const state = user.id;

    const authUrl = getMetaAuthUrl(redirectUri, state);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("Meta auth error:", err);
    const origin = request.nextUrl.origin;
    return NextResponse.redirect(new URL(`/ads-spend?meta_error=auth_failed`, origin));
  }
}
