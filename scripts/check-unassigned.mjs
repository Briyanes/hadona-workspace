/**
 * Query Supabase langsung dengan SERVICE_ROLE_KEY (bypass RLS)
 * untuk cek akun Unassigned tanpa perlu login browser.
 *
 * Run: node scripts/check-unassigned.mjs
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

async function query(path, queryParams = "") {
  const url = `${SUPABASE_URL}/rest/v1/${path}${queryParams}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Profile": "public",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  console.log("🔍 Querying Supabase (SERVICE_ROLE)...\n");

  // 1. Total ad accounts
  const allAccounts = await query("ad_accounts?select=id,ad_account_id,account_name,client_id,platform,status&order=created_at.desc");
  console.log(`📊 TOTAL ad_accounts: ${allAccounts.length}`);

  // 2. Unassigned (client_id = null)
  const unassigned = allAccounts.filter((a) => !a.client_id);
  console.log(`⚠️  UNASSIGNED (client_id IS NULL): ${unassigned.length}`);

  if (unassigned.length > 0) {
    console.log("\n   Daftar akun Unassigned:");
    unassigned.forEach((a, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. [${a.platform}] ${a.account_name || "(no name)"} — ID: ${a.ad_account_id} — status: ${a.status}`);
    });
  }

  // 3. Assigned
  const assigned = allAccounts.filter((a) => a.client_id);
  console.log(`\n✅ ASSIGNED: ${assigned.length}`);

  // 4. Without account_name
  const noName = allAccounts.filter((a) => !a.account_name);
  console.log(`📛 Tanpa account_name: ${noName.length}`);

  // 5. Clients untuk reference
  const clients = await query("clients?select=id,name&order=name");
  console.log(`\n🏢 Total clients: ${clients.length}`);

  console.log("\n✅ Done");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});