import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getMetaUser,
  getAdAccounts,
  getBusinessAdAccounts,
} from "@/lib/meta";
import { createClient } from "@/lib/supabase/server";

// Hadona's Business Portfolio ID
const HADONA_BM_ID = process.env.META_BUSINESS_ID || "1380114199447586";

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
      console.error("[Meta Callback] State mismatch:", { userId: user?.id, state });
      return NextResponse.redirect(
        new URL("/ads-spend?meta_error=state_mismatch", origin)
      );
    }

    const redirectUri = `${origin}/api/meta/callback`;

    // Step 1: Exchange code for short-lived token
    const tokenData = await exchangeCodeForToken(code, redirectUri);

    // Step 2: Exchange for long-lived token (60 days)
    // FIX B1: Long-lived exchange is MANDATORY. Short-lived tokens expire in 1-2 hours
    // and cause Error [190] on sync. No silent fallback!
    let longLivedToken: string;
    let expiresInSeconds: number;

    try {
      const longLived = await getLongLivedToken(tokenData.access_token);
      longLivedToken = longLived.access_token;
      expiresInSeconds = longLived.expires_in || 5184000; // 60 days

      // Sanity check: long-lived tokens should have expires_in >= 86400 (1 day)
      if (expiresInSeconds < 3600) {
        throw new Error(`Long-lived exchange returned suspiciously short expiry: ${expiresInSeconds}s. App may be in Development Mode without proper config.`);
      }

    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("[Meta Callback] Step 2 ❌ Long-lived exchange FAILED:", errMsg);
      return NextResponse.redirect(
        new URL(`/ads-spend?meta_error=${encodeURIComponent("Failed to get long-lived token: " + errMsg)}`, origin)
      );
    }

    // Step 3: Get Meta user profile
    const metaUser = await getMetaUser(longLivedToken);

    // Step 4: Get ad accounts from BOTH Business Manager AND personal
    // NOTE: Without ads_read scope, personal may fail. BM might still work.
    let adAccounts: Awaited<ReturnType<typeof getAdAccounts>> = [];
    let tokenNeedsUpgrade = false;

    // 4a. Try Business Manager accounts first
    try {
      const bmAccounts = await getBusinessAdAccounts(HADONA_BM_ID, longLivedToken);
      adAccounts = bmAccounts;
    } catch (bmErr) {
      const bmMsg = bmErr instanceof Error ? bmErr.message : String(bmErr);
      console.warn("[Meta Callback] Step 4 ⚠️ BM ad accounts fetch failed:", bmMsg);
    }

    // 4b. Also fetch personal accounts and merge (dedup)
    try {
      const personalAccounts = await getAdAccounts(longLivedToken);
      const existingIds = new Set(adAccounts.map((a) => a.account_id));
      for (const pa of personalAccounts) {
        if (!existingIds.has(pa.account_id)) {
          adAccounts.push(pa);
        }
      }
    } catch (adsErr) {
      const adsMsg = adsErr instanceof Error ? adsErr.message : String(adsErr);
      console.warn("[Meta Callback] Step 4 ⚠️ Personal ad accounts fetch failed:", adsMsg);
      if (adAccounts.length === 0) {
        tokenNeedsUpgrade = true;
      }
    }

    if (adAccounts.length === 0) {
      console.warn("[Meta Callback] Step 4 ⚠️ No ad accounts found. User should use System User Token.");
      tokenNeedsUpgrade = true;
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    // Step 5: Upsert connection to DB
    const { data: connectionDataRaw, error: dbError } = await supabase
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
      })
      .select("id")
      .single();

    const connectionData = connectionDataRaw as unknown as { id: string } | null;

    if (dbError || !connectionData) {
      console.error("[Meta Callback] Step 5 ❌ DB Error:", dbError);
      return NextResponse.redirect(
        new URL("/ads-spend?meta_error=db_error", origin)
      );
    }

    // Step 6: Auto-link existing META ad accounts in DB to this connection
    // Match by ad_account_id (Meta returns account_id without "act_" prefix)
    let linkedCount = 0;
    if (adAccounts.length > 0) {
      const metaAccountIds = adAccounts.map((a) => a.account_id);

      // Find existing ad_accounts in DB that match Meta's account_ids
      const { data: existingAccountsRaw } = await supabase
        .from("ad_accounts")
        .select("id, ad_account_id")
        .eq("platform", "META")
        .in("ad_account_id", metaAccountIds);

      const existingAccounts =
        (existingAccountsRaw as unknown as Array<{ id: string; ad_account_id: string }>) || [];

      if (existingAccounts.length > 0) {
        // Link each matching account to this connection + enable sync
        for (const acc of existingAccounts) {
          await supabase
            .from("ad_accounts")
            .update({
              meta_connection_id: connectionData.id,
              meta_sync_enabled: true,
            } as never)
            .eq("id", acc.id);
          linkedCount++;
        }
      }
    }

    // Success — redirect back to ads-spend page
    const successUrl = new URL("/ads-spend", origin);
    successUrl.searchParams.set("meta_connected", "true");
    if (linkedCount > 0) {
      successUrl.searchParams.set("meta_linked", linkedCount.toString());
    }
    if (tokenNeedsUpgrade) {
      successUrl.searchParams.set("token_needs_upgrade", "true");
    }
    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("Meta callback error:", err);
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/ads-spend?meta_error=${encodeURIComponent(message)}`, origin)
    );
  }
}