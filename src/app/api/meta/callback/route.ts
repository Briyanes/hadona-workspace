import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getMetaUser,
  getAdAccounts,
} from "@/lib/meta";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/meta/callback?code=xxx&state=xxx
 * Meta redirects here after user authorizes. Exchange code for token, save to DB.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // user_id
  const errorParam = searchParams.get("error");

  const origin = request.nextUrl.origin;

  // User denied permission
  if (errorParam) {
    return NextResponse.redirect(
      new URL("/ads-spend?meta_error=permission_denied", origin)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/ads-spend?meta_error=missing_params", origin)
    );
  }

  try {
    const supabase = createClient();

    // Verify the user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== state) {
      return NextResponse.redirect(
        new URL("/ads-spend?meta_error=state_mismatch", origin)
      );
    }

    const redirectUri = `${origin}/api/meta/callback`;

    // Step 1: Exchange code for short-lived token
    const tokenData = await exchangeCodeForToken(code, redirectUri);

    // Step 2: Exchange for long-lived token (60 days)
    let longLivedToken = tokenData.access_token;
    let expiresInSeconds = tokenData.expires_in || 5184000; // default 60 days

    try {
      const longLived = await getLongLivedToken(tokenData.access_token);
      longLivedToken = longLived.access_token;
      expiresInSeconds = longLived.expires_in || expiresInSeconds;
    } catch (e) {
      console.warn("Could not get long-lived token, using short-lived:", e);
    }

    // Step 3: Get Meta user profile
    const metaUser = await getMetaUser(longLivedToken);

    // Step 4: Get ad accounts cache
    const adAccounts = await getAdAccounts(longLivedToken);

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    // Step 5: Upsert connection to DB
    const { error: dbError } = await supabase
      .from("meta_connections")
      .upsert({
        user_id: user.id,
        fb_user_id: metaUser.id,
        fb_user_name: metaUser.name,
        access_token: longLivedToken,
        token_expires_at: expiresAt.toISOString(),
        ad_accounts_cache: adAccounts,
        auto_sync: true,
        is_active: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "connected",
      } as never, {
        onConflict: "user_id,fb_user_id",
      });

    if (dbError) {
      console.error("DB Error saving Meta connection:", dbError);
      return NextResponse.redirect(
        new URL("/ads-spend?meta_error=db_error", origin)
      );
    }

    // Success — redirect back to ads-spend page
    return NextResponse.redirect(
      new URL("/ads-spend?meta_connected=true", origin)
    );
  } catch (err) {
    console.error("Meta callback error:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/ads-spend?meta_error=${encodeURIComponent(message)}`, origin)
    );
  }
}