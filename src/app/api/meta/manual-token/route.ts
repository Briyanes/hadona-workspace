import { NextRequest, NextResponse } from "next/server";
import {
  getLongLivedToken,
  getMetaUser,
  getAdAccounts,
} from "@/lib/meta";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/meta/manual-token
 * Fallback: User provides a short-lived access token from Graph API Explorer.
 * We exchange it for long-lived (60 days), get user profile & ad accounts, then save.
 *
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string" || token.trim().length < 20) {
      return NextResponse.json(
        { error: "Token tidak valid. Pastikan token dari Graph API Explorer." },
        { status: 400 }
      );
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "META_APP_ID atau META_APP_SECRET belum dikonfigurasi di server." },
        { status: 500 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Meta Manual] Step 1: Getting user profile with provided token...");
    let metaUser;
    try {
      metaUser = await getMetaUser(token.trim());
      console.log("[Meta Manual] ✅ User:", metaUser.name, "(" + metaUser.id + ")");
    } catch {
      return NextResponse.json(
        {
          error:
            "Token tidak valid atau sudah kedaluwarsa. Generate ulang di Graph API Explorer.",
        },
        { status: 400 }
      );
    }

    // Step 2: Exchange for long-lived token
    console.log("[Meta Manual] Step 2: Exchanging for long-lived token...");
    let longLivedToken = token.trim();
    let expiresInSeconds = 5184000; // 60 days default

    try {
      const longLived = await getLongLivedToken(token.trim());
      longLivedToken = longLived.access_token;
      expiresInSeconds = longLived.expires_in || expiresInSeconds;
      console.log("[Meta Manual] ✅ Long-lived token received (expires in", expiresInSeconds, "s)");
    } catch (e) {
      console.warn(
        "[Meta Manual] ⚠️ Could not exchange for long-lived token:",
        e instanceof Error ? e.message : e
      );
      // Continue with the short-lived token — still works for ~1-2 hours
    }

    // Step 3: Get ad accounts
    console.log("[Meta Manual] Step 3: Getting ad accounts...");
    let adAccounts: Array<{ account_id: string; name: string }> = [];
    try {
      adAccounts = await getAdAccounts(longLivedToken);
      console.log("[Meta Manual] ✅ Found", adAccounts.length, "ad accounts");
    } catch (e) {
      console.warn(
        "[Meta Manual] ⚠️ Could not fetch ad accounts:",
        e instanceof Error ? e.message : e
      );
    }

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    // Step 4: Save to DB
    console.log("[Meta Manual] Step 4: Saving to database...");
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
        last_sync_status: "connected_manual",
      } as never, {
        onConflict: "user_id,fb_user_id",
      })
      .select("id")
      .single();

    const connectionData = connectionDataRaw as unknown as { id: string } | null;

    if (dbError || !connectionData) {
      console.error("[Meta Manual] ❌ DB Error:", dbError);
      return NextResponse.json(
        { error: "Gagal menyimpan koneksi: " + (dbError?.message || "unknown") },
        { status: 500 }
      );
    }

    // Step 5: Auto-link existing ad accounts
    let linkedCount = 0;
    if (adAccounts.length > 0) {
      const metaAccountIds = adAccounts.map((a) => a.account_id);
      const { data: existingAccountsRaw } = await supabase
        .from("ad_accounts")
        .select("id, ad_account_id")
        .eq("platform", "META")
        .in("ad_account_id", metaAccountIds);

      const existingAccounts =
        (existingAccountsRaw as unknown as Array<{ id: string; ad_account_id: string }>) || [];

      if (existingAccounts.length > 0) {
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

    console.log("[Meta Manual] ✅ All done! Linked:", linkedCount);

    return NextResponse.json({
      success: true,
      message: `Meta account ${metaUser.name} berhasil terhubung!`,
      user: metaUser.name,
      ad_accounts_found: adAccounts.length,
      ad_accounts_linked: linkedCount,
      expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("[Meta Manual] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}