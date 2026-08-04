import { NextRequest, NextResponse } from "next/server";
import {
  getLongLivedToken,
  getMetaUser,
  getAdAccounts,
  getBusinessAdAccounts,
  isSystemUserToken,
  getTokenInfo,
} from "@/lib/meta";

// Hadona's Business Portfolio ID
const HADONA_BM_ID = process.env.META_BUSINESS_ID || "1380114199447586";
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

    // Step 1: Check if this is a System User token (permanent, no expiry, no App Review needed)
    console.log("[Meta Manual] Step 1: Checking token type...");
    const isSystemToken = await isSystemUserToken(token.trim());
    console.log("[Meta Manual] System User Token:", isSystemToken ? "YES ✅ (permanent)" : "NO (will exchange to long-lived)");

    let longLivedToken: string;
    let expiresAt: Date | null;
    let metaUser: { id: string; name: string };

    if (isSystemToken) {
      // System User token — already permanent, no exchange needed
      longLivedToken = token.trim();
      expiresAt = null; // Never expires

      // Get token info for debugging
      const tokenInfo = await getTokenInfo(longLivedToken);
      console.log("[Meta Manual] ✅ System User token — scopes:", tokenInfo.scopes.join(", "));

      // System User tokens may not return /me — use the token debug data for identity
      try {
        metaUser = await getMetaUser(longLivedToken);
        console.log("[Meta Manual] ✅ User:", metaUser.name, "(" + metaUser.id + ")");
      } catch {
        // Fallback for System User tokens that can't call /me
        metaUser = {
          id: `sys_${Date.now()}`,
          name: "System User (Business Manager)",
        };
        console.log("[Meta Manual] ✅ Using System User fallback identity");
      }
    } else {
      // Regular user token — must exchange to long-lived
      console.log("[Meta Manual] Step 1b: Getting user profile...");
      try {
        metaUser = await getMetaUser(token.trim());
        console.log("[Meta Manual] ✅ User:", metaUser.name, "(" + metaUser.id + ")");
      } catch {
        return NextResponse.json(
          {
            error:
              "Token tidak valid atau sudah kedaluwarsa. Jika menggunakan token dari Graph API Explorer, pastikan token masih fresh. Untuk solusi permanent, gunakan System User Token dari Meta Business Settings (lihat panduan di modal).",
          },
          { status: 400 }
        );
      }

      // Step 2: Exchange for long-lived token (mandatory for regular tokens)
      console.log("[Meta Manual] Step 2: Exchanging for long-lived token...");
      try {
        const longLived = await getLongLivedToken(token.trim());
        longLivedToken = longLived.access_token;
        const expiresInSeconds = longLived.expires_in || 5184000; // 60 days

        if (expiresInSeconds < 3600) {
          throw new Error(`Long-lived exchange returned suspiciously short expiry: ${expiresInSeconds}s.`);
        }

        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);
        console.log("[Meta Manual] ✅ Long-lived token (expires in", expiresInSeconds, "s)");
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error("[Meta Manual] ❌ Long-lived exchange FAILED:", errMsg);
        return NextResponse.json(
          {
            error: "Gagal exchange ke long-lived token. Untuk solusi permanent tanpa App Review, gunakan System User Token dari Meta Business Settings → Users → System Users → Add → Generate Token. Lihat panduan lengkap di modal.",
          },
          { status: 400 }
        );
      }
    }

    // Step 3: Get ad accounts from BOTH Business Manager AND personal
    console.log("[Meta Manual] Step 3: Getting ad accounts (BM + personal)...");
    let adAccounts: Array<{ account_id: string; name: string }> = [];

    // 3a. Try Business Manager accounts first (critical for System User tokens)
    try {
      const bmAccounts = await getBusinessAdAccounts(HADONA_BM_ID, longLivedToken);
      adAccounts = bmAccounts;
      console.log("[Meta Manual] ✅ Found", bmAccounts.length, "BM ad accounts");
    } catch (e) {
      console.warn(
        "[Meta Manual] ⚠️ Could not fetch BM ad accounts:",
        e instanceof Error ? e.message : e
      );
    }

    // 3b. Also fetch personal accounts and merge (dedup by account_id)
    try {
      const personalAccounts = await getAdAccounts(longLivedToken);
      const existingIds = new Set(adAccounts.map((a) => a.account_id));
      for (const pa of personalAccounts) {
        if (!existingIds.has(pa.account_id)) {
          adAccounts.push(pa);
        }
      }
      console.log("[Meta Manual] ✅ Total unique ad accounts (BM + personal):", adAccounts.length);
    } catch (e) {
      console.warn(
        "[Meta Manual] ⚠️ Could not fetch personal ad accounts:",
        e instanceof Error ? e.message : e
      );
    }

    if (adAccounts.length === 0) {
      console.warn("[Meta Manual] ⚠️ No ad accounts found! Token may lack permissions.");
    }

    // Step 4: Save to DB
    console.log("[Meta Manual] Step 4: Saving to database...");
    const { data: connectionDataRaw, error: dbError } = await supabase
      .from("meta_connections")
      .upsert({
        user_id: user.id,
        fb_user_id: metaUser.id,
        fb_user_name: metaUser.name,
        access_token: longLivedToken,
        token_expires_at: expiresAt ? expiresAt.toISOString() : null,
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
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    });
  } catch (err) {
    console.error("[Meta Manual] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}