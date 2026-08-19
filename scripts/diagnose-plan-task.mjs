#!/usr/bin/env node
/**
 * Diagnose: plan → task trigger issue
 * 1. Tasks with sheet_row_id LIKE 'content_plan:%' (did trigger create tasks?)
 * 2. RLS policies on tasks (INSERT) — is ANYA blocked?
 * 3. ANYA profile (role/division) + recent Content Production tasks
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const txt = fs.readFileSync(resolve(ROOT, ".env.local"), "utf8");
const env = {};
for (const line of txt.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function section(title) {
  console.log(`\n══ ${title} ══`);
}

async function main() {
  console.log(`🔍 Diagnosing plan→task @ ${env.NEXT_PUBLIC_SUPABASE_URL}`);

  // ── 1. Tasks hasil trigger (sheet_row_id content_plan:*)
  section("1. Tasks hasil trigger plan→task (15 terbaru)");
  const { data: triggered } = await supabase
    .from("tasks")
    .select("id, title, status, division, sheet_row_id, due_date, created_at, client:clients(name)")
    .like("sheet_row_id", "content_plan:%")
    .order("created_at", { ascending: false })
    .limit(15);
  if (!triggered || triggered.length === 0) {
    console.log("❌ TIDAK ADA task dengan sheet_row_id content_plan:* — trigger belum pernah berhasil!");
  } else {
    for (const t of triggered) {
      console.log(
        `• [${t.status}] "${t.title}" | div=${t.division} | row=${t.sheet_row_id} | client=${t.client?.name || "-"} | ${t.created_at}`
      );
    }
  }

  // ── 2. Tasks Content Production terbaru
  section("2. Tasks 'Content Production' 10 terbaru");
  const { data: cpTasks } = await supabase
    .from("tasks")
    .select("id, title, status, sheet_row_id, created_at, client:clients(name)")
    .eq("division", "Content Production")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const t of cpTasks || []) {
    console.log(
      `• [${t.status}] "${t.title}" | client=${t.client?.name || "-"} | row=${t.sheet_row_id || "-"} | ${t.created_at}`
    );
  }

  // ── 3. RLS policies tasks (INSERT)
  section("3. RLS policies tasks (INSERT)");
  const { data: insPolicies } = await supabase
    .from("pg_policies")
    .select("policyname, cmd, roles, qual, with_check")
    .eq("tablename", "tasks")
    .eq("cmd", "INSERT");
  if (!insPolicies || insPolicies.length === 0) {
    console.log("❌ TIDAK ADA policy INSERT di tasks → semua user anonim TIDAK BISA insert!");
  } else {
    for (const p of insPolicies) {
      console.log(`\n[${p.policyname}] roles=${JSON.stringify(p.roles)}`);
      console.log(`  WITH CHECK: ${p.with_check}`);
    }
  }

  section("3b. Semua policy tasks (ringkas)");
  const { data: allPolicies } = await supabase
    .from("pg_policies")
    .select("policyname, cmd")
    .eq("tablename", "tasks");
  for (const p of allPolicies || []) {
    console.log(`• ${p.policyname} (${p.cmd})`);
  }

  // ── 4. Profile ANYA
  section("4. Profile ANYA");
  const { data: anya } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, status")
    .or("full_name.ilike.%anya%,email.ilike.%anya%");
  if (!anya || anya.length === 0) {
    console.log("⚠️ Profile 'anya' tidak ditemukan via ilike");
  } else {
    for (const p of anya) {
      console.log(`• ${p.full_name} | role=${p.role} | division=${JSON.stringify(p.division)} | status=${p.status}`);
    }
  }

  // ── 5. Content plans terbaru
  section("5. Content plans 10 terbaru");
  const { data: plans } = await supabase
    .from("content_plans")
    .select("id, plan_month, status, created_at, client:clients(name)")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const p of plans || []) {
    console.log(`• ${p.client?.name || "?"} | ${p.plan_month} | status=${p.status} | ${p.created_at}`);
  }

  console.log("\n✅ Diagnosis selesai");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});