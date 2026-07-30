/**
 * Debug Script: Test Meta API Business Portfolio call directly
 * 
 * Run: npx tsx src/scripts/debug-meta.ts
 * 
 * This bypasses the sync route and tests:
 * 1. Get connection from Supabase
 * 2. Call Meta API directly
 * 3. Print exact error if any
 */

import { createClient } from "@supabase/supabase-js";

// Load .env.local
const envLocal = require("fs").readFileSync(".env.local", "utf8");
const envVars: Record<string, string> = {};
envLocal.split("\n").forEach((line: string) => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2];
});

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
const BM_ID = envVars.META_BUSINESS_ID || "1380114199447586";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  META API DEBUG SCRIPT - Full Audit");
  console.log("═══════════════════════════════════════════\n");

  // ─── STEP 1: Get Meta Connections ───
  console.log("📋 STEP 1: Fetching meta_connections from Supabase...\n");
  const { data: connections, error: connError } = await supabase
    .from("meta_connections")
    .select("*")
    .eq("is_active", true);

  if (connError) {
    console.error("❌ Error fetching connections:", connError.message);
    process.exit(1);
  }

  if (!connections || connections.length === 0) {
    console.error("❌ No active meta_connections found!");
    process.exit(1);
  }

  console.log(`✅ Found ${connections.length} connection(s):\n`);
  for (const conn of connections) {
    console.log(`   • ID: ${conn.id}`);
    console.log(`   • User: ${conn.fb_user_name} (${conn.fb_user_id})`);
    console.log(`   • Token: ${conn.access_token?.substring(0, 30)}...`);
    console.log(`   • Token expires: ${conn.token_expires_at || "N/A"}`);
    console.log(`   • Auto-sync: ${conn.auto_sync}`);
    console.log("");
  }

  const conn = connections[0];
  const token = conn.access_token;

  if (!token) {
    console.error("❌ No access_token in connection!");
    process.exit(1);
  }

  // ─── STEP 2: Check existing ad_accounts in DB ───
  console.log("📋 STEP 2: Checking ad_accounts in database...\n");
  const { data: allAccounts, error: accError } = await supabase
    .from("ad_accounts")
    .select("id, ad_account_id, account_name, platform, meta_connection_id, meta_sync_enabled")
    .eq("platform", "META");

  if (accError) {
    console.error("❌ Error fetching ad_accounts:", accError.message);
  } else {
    const total = allAccounts?.length || 0;
    const unknown = allAccounts?.filter((a: any) => a.ad_account_id?.startsWith("UNKNOWN-")) || [];
    const real = allAccounts?.filter((a: any) => !a.ad_account_id?.startsWith("UNKNOWN-")) || [];
    const linked = allAccounts?.filter((a: any) => a.meta_connection_id === conn.id) || [];

    console.log(`   Total META accounts in DB: ${total}`);
    console.log(`   • With real IDs: ${real.length}`);
    console.log(`   • With UNKNOWN-XX IDs: ${unknown.length}`);
    console.log(`   • Linked to this connection: ${linked.length}`);
    console.log("");
  }

  // ─── STEP 3: Test Meta API - Get User Profile ───
  console.log("📋 STEP 3: Testing Meta API - /me endpoint...\n");
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name,email&access_token=${token}`
    );
    const meData = await meRes.json();

    if (meData.error) {
      console.error(`❌ /me ERROR: ${meData.error.message} (code: ${meData.error.code})\n`);
    } else {
      console.log(`   ✅ User: ${meData.name} (${meData.id})`);
      console.log(`   ✅ Email: ${meData.email || "N/A"}\n`);
    }
  } catch (err: any) {
    console.error(`❌ /me fetch failed: ${err.message}\n`);
  }

  // ─── STEP 4: Test Meta API - Personal Ad Accounts ───
  console.log("📋 STEP 4: Testing Meta API - /me/adaccounts (personal)...\n");
  try {
    const url = `https://graph.facebook.com/v22.0/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name&limit=100&access_token=${token}`;
    const accRes = await fetch(url);
    const accData = await accRes.json();

    if (accData.error) {
      console.error(`❌ /me/adaccounts ERROR: ${accData.error.message} (code: ${accData.error.code})\n`);
    } else {
      const accounts = accData.data || [];
      console.log(`   ✅ Found ${accounts.length} personal ad accounts:`);
      for (const acc of accounts.slice(0, 5)) {
        console.log(`      • ${acc.name} → ${acc.account_id} (status: ${acc.account_status})`);
      }
      if (accounts.length > 5) console.log(`      ... and ${accounts.length - 5} more`);
      console.log("");
    }
  } catch (err: any) {
    console.error(`❌ /me/adaccounts fetch failed: ${err.message}\n`);
  }

  // ─── STEP 5: Test Meta API - User Businesses ───
  console.log("📋 STEP 5: Testing Meta API - /me/businesses...\n");
  try {
    const bizRes = await fetch(
      `https://graph.facebook.com/v22.0/me/businesses?fields=id,name,vertical&limit=10&access_token=${token}`
    );
    const bizData = await bizRes.json();

    if (bizData.error) {
      console.error(`❌ /me/businesses ERROR: ${bizData.error.message} (code: ${bizData.error.code})\n`);
    } else {
      const businesses = bizData.data || [];
      console.log(`   ✅ Found ${businesses.length} businesses:`);
      for (const biz of businesses) {
        console.log(`      • ${biz.name} → ID: ${biz.id} (${biz.vertical || "N/A"})`);
      }
      console.log("");
    }
  } catch (err: any) {
    console.error(`❌ /me/businesses fetch failed: ${err.message}\n`);
  }

  // ─── STEP 6: Test Meta API - Business Portfolio Ad Accounts ───
  console.log(`📋 STEP 6: Testing Meta API - /${BM_ID}/owned_ad_accounts (Business Portfolio)...\n`);
  try {
    const fields = "id,account_id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance";
    const bmUrl = `https://graph.facebook.com/v22.0/${BM_ID}/owned_ad_accounts?fields=${fields}&limit=100&access_token=${token}`;
    console.log(`   URL: ${bmUrl.replace(token, "TOKEN_HIDDEN")}\n`);

    const bmRes = await fetch(bmUrl);
    const bmData = await bmRes.json();

    if (bmData.error) {
      console.error(`❌ Business Portfolio ERROR:`);
      console.error(`   Message: ${bmData.error.message}`);
      console.error(`   Type: ${bmData.error.type || "N/A"}`);
      console.error(`   Code: ${bmData.error.code || "N/A"}`);
      console.error(`   FB Trace ID: ${bmData.error.fbtrace_id || "N/A"}\n`);

      // ─── STEP 7: If BM fails, diagnose why ───
      console.log("📋 STEP 7: Diagnosing BM failure...\n");

      // Check if user has access to this BM
      console.log("   Checking if user has access to BM...");
      try {
        const bmUserCheck = await fetch(
          `https://graph.facebook.com/v22.0/${BM_ID}?fields=id,name&access_token=${token}`
        );
        const bmUserCheckData = await bmUserCheck.json();

        if (bmUserCheckData.error) {
          console.error(`   ❌ User does NOT have access to BM ${BM_ID}: ${bmUserCheckData.error.message}\n`);
        } else {
          console.log(`   ✅ BM exists: ${bmUserCheckData.name} (${bmUserCheckData.id})`);
          console.log(`   → User has access, but owned_ad_accounts failed.\n`);
        }
      } catch (err: any) {
        console.error(`   ❌ BM check failed: ${err.message}\n`);
      }

      // Check token scopes
      console.log("   Checking token scopes...");
      const appId = envVars.META_APP_ID;
      const appSecret = envVars.META_APP_SECRET;

      if (!appId || !appSecret) {
        console.error("   ⚠️ META_APP_ID or META_APP_SECRET is EMPTY in .env.local!\n");
      } else {
        try {
          // Get app access token
          const appTokenRes = await fetch(
            `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`
          );
          const appTokenData = await appTokenRes.json();

          if (appTokenData.error) {
            console.error(`   ❌ Failed to get app token: ${appTokenData.error.message}\n`);
          } else {
            // Debug token
            const debugRes = await fetch(
              `https://graph.facebook.com/v22.0/debug_token?input_token=${token}&access_token=${appTokenData.access_token}`
            );
            const debugData = await debugRes.json();

            if (debugData.data) {
              console.log(`   Token Scopes: ${debugData.data.scopes?.join(", ") || "NONE"}`);
              console.log(`   Token Valid: ${debugData.data.is_valid}`);
              console.log(`   Token Expires: ${debugData.data.expires_at > 0 ? new Date(debugData.data.expires_at * 1000).toISOString() : "Never"}\n`);

              // Check required scopes
              const requiredScopes = ["ads_read", "ads_management"];
              const hasScopes = requiredScopes.filter((s) => debugData.data.scopes?.includes(s));
              const missingScopes = requiredScopes.filter((s) => !debugData.data.scopes?.includes(s));

              if (missingScopes.length > 0) {
                console.error(`   ❌ MISSING SCOPES: ${missingScopes.join(", ")}\n`);
              } else {
                console.log(`   ✅ All required scopes present\n`);
              }
            }
          }
        } catch (err: any) {
          console.error(`   ❌ Token debug failed: ${err.message}\n`);
        }
      }
    } else {
      const accounts = bmData.data || [];
      console.log(`   ✅ Found ${accounts.length} ad accounts in Business Portfolio!\n`);
      for (const acc of accounts.slice(0, 10)) {
        console.log(`      • ${acc.name} → ${acc.account_id} (status: ${acc.account_status})`);
      }
      if (accounts.length > 10) console.log(`      ... and ${accounts.length - 10} more`);

      // Active vs inactive
      const active = accounts.filter((a: any) => a.account_status === 1);
      const inactive = accounts.filter((a: any) => a.account_status !== 1);
      console.log(`\n   📊 Active: ${active.length} | Inactive: ${inactive.length}\n`);

      // ─── STEP 7: Test insights for first active account ───
      if (active.length > 0) {
        const testAccount = active[0];
        console.log(`📋 STEP 7: Testing insights for "${testAccount.name}" (${testAccount.account_id})...\n`);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split("T")[0];

        const insightParams = new URLSearchParams({
          access_token: token,
          fields: "spend,impressions,clicks,actions",
          time_range: JSON.stringify({ since: dateStr, until: dateStr }),
          level: "account",
          time_increment: "1",
        });

        const actId = testAccount.account_id.startsWith("act_")
          ? `act_${testAccount.account_id}`
          : `act_${testAccount.account_id}`;

        try {
          const insightRes = await fetch(
            `https://graph.facebook.com/v22.0/act_${testAccount.account_id}/insights?${insightParams}`
          );
          const insightData = await insightRes.json();

          if (insightData.error) {
            console.error(`❌ Insights error: ${insightData.error.message}\n`);
          } else {
            const insights = insightData.data || [];
            console.log(`   ✅ Got ${insights.length} insight records:`);
            for (const ins of insights) {
              console.log(`      • Date: ${ins.date_start} | Spend: $${ins.spend} | Impressions: ${ins.impressions} | Clicks: ${ins.clicks}`);
            }
            console.log("");
          }
        } catch (err: any) {
          console.error(`❌ Insights fetch failed: ${err.message}\n`);
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ Business Portfolio fetch failed: ${err.message}\n`);
  }

  console.log("═══════════════════════════════════════════");
  console.log("  DEBUG COMPLETE - Check results above");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});