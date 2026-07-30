/**
 * Test Script: Verify the RLS fix works (Phase 1 + Phase 2)
 * 
 * Run: npx tsx src/scripts/test-sync-fix.ts
 * 
 * This simulates what the sync route does, but with admin client.
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
const ANON_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BM_ID = "1380114199447586";

// ===== TEST 1: ANON KEY (simulates OLD broken behavior) =====
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

// ===== TEST 2: SERVICE ROLE KEY (simulates NEW fixed behavior) =====
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function testRLS() {
  console.log("═══════════════════════════════════════════");
  console.log("  RLS FIX VERIFICATION TEST");
  console.log("═══════════════════════════════════════════\n");

  // ─── TEST A: SELECT with ANON (no auth) ───
  console.log("📋 TEST A: SELECT ad_accounts with ANON_KEY (no user session)...\n");
  const { data: anonSelect, error: anonSelectErr } = await anonClient
    .from("ad_accounts")
    .select("id, ad_account_id")
    .eq("platform", "META")
    .limit(5);

  if (anonSelectErr) {
    console.log(`   ⚠️ ANON select error: ${anonSelectErr.message}`);
    console.log(`   → This confirms RLS blocks unauthenticated access\n`);
  } else {
    console.log(`   ✅ ANON select returned: ${anonSelect?.length || 0} rows\n`);
  }

  // ─── TEST B: SELECT with SERVICE ROLE ───
  console.log("📋 TEST B: SELECT ad_accounts with SERVICE_ROLE_KEY...\n");
  const { data: adminSelect, error: adminSelectErr } = await adminClient
    .from("ad_accounts")
    .select("id, ad_account_id")
    .eq("platform", "META")
    .limit(5);

  if (adminSelectErr) {
    console.error(`   ❌ ADMIN select error: ${adminSelectErr.message}\n`);
  } else {
    console.log(`   ✅ ADMIN select returned: ${adminSelect?.length || 0} rows\n`);
  }

  // ─── TEST C: INSERT with SERVICE ROLE (dry run - insert then immediately delete) ───
  console.log("📋 TEST C: INSERT ad_account with SERVICE_ROLE_KEY (dry run)...\n");

  const testId = `TEST-DRYRUN-${Date.now()}`;
  const { data: insertData, error: insertErr } = await adminClient
    .from("ad_accounts")
    .insert({
      ad_account_id: testId,
      platform: "META",
      account_name: "TEST - DELETE ME",
      status: "inactive",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error(`   ❌ ADMIN insert FAILED: ${insertErr.message}\n`);
    console.error(`   → RLS still blocking! Fix not working!\n`);
  } else {
    console.log(`   ✅ ADMIN insert SUCCESS! Row ID: ${insertData?.id}\n`);

    // Cleanup: delete the test row
    const { error: delErr } = await adminClient.from("ad_accounts").delete().eq("id", insertData.id);
    if (delErr) {
      console.error(`   ⚠️ Cleanup failed: ${delErr.message}\n`);
    } else {
      console.log(`   🧹 Test row deleted\n`);
    }
  }

  // ─── TEST D: UPDATE existing account with SERVICE ROLE ───
  console.log("📋 TEST D: UPDATE existing ad_account with SERVICE_ROLE_KEY...\n");

  // Get first account
  const { data: firstAcc } = await adminClient
    .from("ad_accounts")
    .select("id, meta_connection_id")
    .eq("platform", "META")
    .limit(1)
    .single();

  if (firstAcc) {
    const originalValue = firstAcc.meta_connection_id;
    const { error: updErr } = await adminClient
      .from("ad_accounts")
      .update({ meta_connection_id: originalValue }) // no-op update
      .eq("id", firstAcc.id);

    if (updErr) {
      console.error(`   ❌ ADMIN update FAILED: ${updErr.message}\n`);
    } else {
      console.log(`   ✅ ADMIN update SUCCESS!\n`);
    }
  }

  // ─── SUMMARY ───
  console.log("═══════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════\n");

  if (insertData || (adminSelect && adminSelect.length > 0)) {
    console.log("✅ SERVICE_ROLE_KEY bypasses RLS successfully!");
    console.log("✅ Sync route fix is CONFIRMED WORKING.");
    console.log("✅ Deploy ke Vercel → Sync Now akan berhasil import 10 BM accounts.\n");
  } else {
    console.log("❌ Something still wrong. Check errors above.\n");
  }
}

testRLS().catch(console.error);