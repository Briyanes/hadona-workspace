/**
 * verify-role-menu-changes.mjs — Sanity test untuk perubahan permission v110
 *
 * Perubahan yang diuji:
 *   1. Account Executive → /ads-spend   = full (sebelumnya locked)
 *   2. Account Executive → /invoices    = full (sebelumnya hidden)
 *   3. /users            = super_admin only, LOCKED untuk semua lainnya
 *      termasuk role project_manager (sebelumnya PM full)
 *
 * Jalankan: npx tsx scripts/verify-role-menu-changes.mjs
 */
import { checkMenuAccess } from "../src/lib/division-permissions";

const tests = [
  // [nama, divisions, role, path, expected]
  ["AE → /ads-spend (dibuka)", ["Account Executive"], "advertiser", "/ads-spend", "full"],
  ["AE → /invoices (dibuka)", ["Account Executive"], "advertiser", "/invoices", "full"],
  ["AE → /users (locked)", ["Account Executive"], "advertiser", "/users", "locked"],

  ["role PM → /users (digembok)", ["Project Manager"], "project_manager", "/users", "locked"],
  ["divisi PM tanpa role → /users (locked)", ["Project Manager"], "advertiser", "/users", "locked"],
  ["role PM → /invoices (tetap full)", ["Project Manager"], "project_manager", "/invoices", "full"],
  ["role PM → /ads-spend (tetap full)", ["Project Manager"], "project_manager", "/ads-spend", "full"],

  ["super_admin → /users (full)", ["Project Manager"], "super_admin", "/users", "full"],
  ["super_admin → /invoices (full)", ["Editor"], "super_admin", "/invoices", "full"],

  ["CC → /invoices (hidden, tak berubah)", ["Content Creator"], "advertiser", "/invoices", "hidden"],
  ["CC → /ads-spend (locked, tak berubah)", ["Content Creator"], "advertiser", "/ads-spend", "locked"],
  ["Adv → /ads-spend (full, tak berubah)", ["Advertiser"], "advertiser", "/ads-spend", "full"],
  ["Editor → /users (locked)", ["Editor"], "advertiser", "/users", "locked"],
];

let pass = 0;
for (const [name, div, role, path, want] of tests) {
  const got = checkMenuAccess(path, div, role);
  const ok = got === want;
  if (ok) pass++;
  console.log(`${ok ? "✅" : "❌"} ${name} → ${got}${ok ? "" : ` (expect ${want})`}`);
}

console.log(`\n${pass}/${tests.length} PASS`);
process.exit(pass === tests.length ? 0 : 1);