import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/meta/status
 * Diagnostic endpoint — checks Meta integration configuration without triggering OAuth.
 * Returns: app_id configured?, app_secret configured?, connection status, redirect URI, etc.
 */
export async function GET() {
  try {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    // Check env vars
    const envStatus = {
      META_APP_ID: appId ? `✅ Set (${appId.length} chars)` : "❌ NOT SET",
      META_APP_SECRET: appSecret ? `✅ Set (${appSecret.length} chars)` : "❌ NOT SET",
      META_API_VERSION: "v19.0",
    };

    // Check user auth
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          status: "error",
          message: "Not authenticated",
          env: envStatus,
        },
        { status: 401 }
      );
    }

    // Check existing connection
    const { data: connection } = await supabase
      .from("meta_connections")
      .select("id, fb_user_name, is_active, auto_sync, token_expires_at, last_sync_status, last_sync_error")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeConnection = (connection as unknown as Array<Record<string, unknown>> | null)?.[0];

    // OAuth URL that would be generated
    const redirectUri = `https://workspace.hadona.id/api/meta/callback`;
    const oauthUrl = appId
      ? `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=ads_read,ads_management,business_management,read_insights&response_type=code&state=${user.id}`
      : null;

    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
      },
      env: envStatus,
      redirect_uri: redirectUri,
      oauth_url: oauthUrl ? `${oauthUrl.substring(0, 80)}...` : null,
      connection: activeConnection || null,
      recommendations: generateRecommendations(!!appId, !!appSecret, !!activeConnection),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function generateRecommendations(hasAppId: boolean, hasAppSecret: boolean, hasConnection: boolean) {
  const recs: string[] = [];

  if (!hasAppId || !hasAppSecret) {
    recs.push("🔴 META_APP_ID or META_APP_SECRET not set. Go to Vercel → Settings → Environment Variables and add them.");
  }

  if (!hasConnection) {
    recs.push("🟡 No Meta connection yet. Try OAuth connect or manual token input.");
  }

  if (hasAppId && hasAppSecret && !hasConnection) {
    recs.push("🟢 Env vars are set. Try clicking 'Connect Meta' on the ads-spend page.");
    recs.push("💡 If OAuth fails, use manual token input from Graph API Explorer.");
  }

  return recs;
}