#!/usr/bin/env node
/**
 * Backfill task Editor untuk Content Plans yang sudah ada (data lama).
 *
 * Masalah: sebelum fitur sync, content plan ber-progress "Proses Edit" tidak
 * otomatis membuat task di Task Manager (divisi Editor). Script ini menutup
 * gap tersebut + merekonsiliasi status task↔plan.
 *
 * Yang dilakukan:
 *   1. Plan "proses_edit" tanpa task ter-link  → buat task Editor (todo)
 *   2. Plan "done" dengan task belum done      → set task done
 *   3. Plan "cancel" dengan task belum blocked → set task blocked (hold)
 *   4. Task ter-link done tapi plan belum done → set plan done (sync editor→plan)
 *
 * Link plan↔task: tasks.sheet_row_id = 'content_plan:<plan_id>'
 *
 * Safety:
 *   - Tidak pernah menghapus task / plan
 *   - Idempoten: jalankan berulang aman (cek existing sebelum insert/update)
 *   - Default dry-run; --apply untuk eksekusi
 *
 * Usage:
 *   node scripts/backfill-editor-tasks.mjs            -> dry-run (laporan saja)
 *   node scripts/backfill-editor-tasks.mjs --apply    -> eksekusi
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / key tidak ditemukan di .env.local");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const linkKey = (planId) => `content_plan:${planId}`;

function buildTitle(plan) {
  const client = plan.client?.name || plan.clients?.name || "Client";
  return `[Content] ${client} — ${plan.tema || plan.konten || "Content Plan"}`;
}

function buildDescription(plan) {
  const parts = [];
  if (plan.pilar) parts.push(`Pilar: ${plan.pilar}`);
  if (plan.konten) parts.push(`Konten: ${plan.konten}`);
  if (plan.tema) parts.push(`Tema: ${plan.tema}`);
  if (plan.details) parts.push("", "Details:", plan.details);
  if (plan.reference) parts.push("", `Reference: ${plan.reference}`);
  return parts.join("\n") || null;
}

async function main() {
  console.log(`\n=== Backfill Editor Tasks (mode: ${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // ── Fallback creator: tasks.created_by NOT NULL → pakai profile admin/manager pertama ──
  let createdBy = null;
  let creatorLabel = "(tidak ditemukan)";
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .or("role.eq.admin,role.eq.manager")
    .limit(1);
  createdBy = adminProfile?.[0]?.id;
  creatorLabel = adminProfile?.[0]?.full_name || createdBy;
  if (!createdBy) {
    const { data: anyProfile } = await supabase.from("profiles").select("id, full_name").limit(1);
    createdBy = anyProfile?.[0]?.id;
    creatorLabel = anyProfile?.[0]?.full_name || createdBy;
  }
  if (APPLY) {
    if (!createdBy) {
      console.error("❌ Tidak ada profile sama sekali — tidak bisa insert task (created_by NOT NULL).");
      process.exit(1);
    }
    console.log(`created_by fallback: ${creatorLabel}\n`);
  }

  // ── 1. Ambil semua plan aktif ──
  const { data: plans, error: pErr } = await supabase
    .from("content_plans")
    .select("id, client_id, pilar, konten, tema, details, reference, tanggal_upload, progress, client:clients(name)")
    .order("created_at", { ascending: true });
  if (pErr) throw pErr;
  console.log(`Total content plans: ${plans.length}`);

  // ── 2. Ambil semua task ter-link ke plan ──
  const { data: linkedTasks, error: tErr } = await supabase
    .from("tasks")
    .select("id, sheet_row_id, status")
    .like("sheet_row_id", "content_plan:%");
  if (tErr) throw tErr;
  const taskByPlan = new Map(
    (linkedTasks || []).map((t) => [t.sheet_row_id.replace("content_plan:", ""), t])
  );
  console.log(`Task ter-link ke plan: ${linkedTasks.length}\n`);

  let toCreate = 0, toDone = 0, toBlocked = 0, toReopenPlan = 0, skipped = 0;

  for (const plan of plans) {
    const key = linkKey(plan.id);
    const task = taskByPlan.get(plan.id);
    const prog = (plan.progress || "draft").toLowerCase().trim();

    // 1) Proses Edit tanpa task → buat
    if (prog === "proses_edit" && !task) {
      toCreate++;
      if (APPLY) {
        const { error } = await supabase.from("tasks").insert({
          title: buildTitle(plan),
          description: buildDescription(plan),
          client_id: plan.client_id || null,
          priority: "medium",
          status: "todo",
          division: "Editor",
          due_date: plan.tanggal_upload || null,
          sheet_row_id: key,
          created_by: createdBy,
        });
        if (error) console.error(`  ❌ create ${key}: ${error.message}`);
        else console.log(`  ✚ task dibuat: ${buildTitle(plan)}`);
      }
      continue;
    }

    if (!task) { skipped++; continue; }

    // 2) Plan done → task done
    if (prog === "done" && task.status !== "done") {
      toDone++;
      if (APPLY) {
        const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);
        if (error) console.error(`  ❌ done ${key}: ${error.message}`);
        else console.log(`  ✓ task → done: ${task.id}`);
      }
      continue;
    }

    // 3) Plan cancel → task blocked (hold)
    if (prog === "cancel" && task.status !== "blocked") {
      toBlocked++;
      if (APPLY) {
        const { error } = await supabase.from("tasks").update({ status: "blocked" }).eq("id", task.id);
        if (error) console.error(`  ❌ block ${key}: ${error.message}`);
        else console.log(`  ⏸ task → blocked: ${task.id}`);
      }
      continue;
    }

    // 4) Plan belum done tapi task sudah done (editor drag selesai, plan belum update)
    //    → update plan jadi done (sinkron arah editor → plan)
    if (prog !== "done" && task.status === "done") {
      toReopenPlan++;
      if (APPLY) {
        const { error } = await supabase
          .from("content_plans")
          .update({ progress: "done" })
          .eq("id", plan.id);
        if (error) console.error(`  ❌ plan-done ${plan.id}: ${error.message}`);
        else console.log(`  ✓ plan → done: ${plan.id} (task editor selesai)`);
      }
    }
  }

  console.log("\n── Ringkasan ──");
  console.log(`  Task Editor baru    : ${toCreate}`);
  console.log(`  Task → done         : ${toDone}`);
  console.log(`  Task → blocked      : ${toBlocked}`);
  console.log(`  Plan → done (sync)  : ${toReopenPlan}`);
  console.log(`  Skipped (sudah ok)  : ${skipped}`);
  console.log(APPLY ? "\n✅ Selesai (applied)." : "\nℹ️  Dry-run — jalankan dengan --apply untuk eksekusi.\n");
}

main().catch((e) => {
  console.error("❌ Gagal:", e.message);
  process.exit(1);
});