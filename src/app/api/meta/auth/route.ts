import { NextRequest, NextResponse } from "next/server";
import { getMetaAuthUrl } from "@/lib/meta";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/meta/auth
 * Initiates Meta OAuth flow — redirects user to Facebook login
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  // Pre-check: verify Meta credentials are configured
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("Meta auth error: META_APP_ID or META_APP_SECRET not set");
    return NextResponse.redirect(
      new URL(`/ads-spend?meta_error=not_configured`, origin)
    );
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build redirect URI (must match what's set in Meta App settings)
    const redirectUri = `${origin}/api/meta/callback`;

    // State = user_id for security (prevent CSRF)
    const state = user.id;

    const authUrl = getMetaAuthUrl(redirectUri, state);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error("Meta auth error:", err);
    return NextResponse.redirect(new URL(`/ads-spend?meta_error=auth_failed`, origin));
  }
}
