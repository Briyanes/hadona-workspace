#!/usr/bin/env node
/**
 * Pembersih task Editor untuk Content Plan ber-status "draft".
 *
 * Masalah: sebelum fix cabang `draft` di src/lib/content-plan-sync.ts, plan yang
 * diubah kembali ke "Draft" masih menyisakan task Editor aktif (todo/in_progress)
 * di Task Manager — padahal plan draft belum pasti dieksekusi.
 *
 * Yang dilakukan (sesuai aturan baru):
 *   Plan "draft" + task ter-link ber-status todo/in_progress → task DIHAPUS
 *   Plan "draft" + task done/blocked → dibiarkan (histori)
 *
 * Link plan↔task: tasks.sheet_row_id = 'content_plan:<plan_id>'
 *
 * Safety:
 *   - Hanya menyentuh task ter-link 'content_plan:%' milik plan draft
 *   - Idempoten: jalankan berulang aman
 *   - Default dry-run; --apply untuk eksekusi
 *
 * Usage:
 *   node scripts/cleanup-draft-plan-tasks.mjs            -> dry-run (laporan saja)
 *   node scripts/cleanup-draft-plan-tasks.mjs --apply    -> eksekusi
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

async function main() {
  console.log(`\n=== Cleanup Draft Plan Tasks (mode: ${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // 1. Ambil semua plan ber-status draft
  const { data: draftPlans, error: pErr } = await supabase
    .from("content_plans")
    .select("id, tema, progress, client:clients(name)")
    .eq("progress", "draft");
  if (pErr) throw pErr;
  console.log(`Plan ber-status draft: ${draftPlans.length}`);

  if (draftPlans.length === 0) {
    console.log("\n✅ Tidak ada plan draft — tidak ada yang perlu dibersihkan.");
    return;
  }

  const draftIds = new Set(draftPlans.map((p) => p.id));

  // 2. Ambil semua task ter-link ke plan mana pun
  const { data: linkedTasks, error: tErr } = await supabase
    .from("tasks")
    .select("id, sheet_row_id, status, title")
    .like("sheet_row_id", "content_plan:%");
  if (tErr) throw tErr;

  // 3. Filter: task milik plan draft yang masih aktif
  const activeTasks = (linkedTasks || []).filter((t) => {
    const planId = t.sheet_row_id.replace("content_plan:", "");
    return draftIds.has(planId) && (t.status === "todo" || t.status === "in_progress");
  });

  const historyTasks = (linkedTasks || []).filter((t) => {
    const planId = t.sheet_row_id.replace("content_plan:", "");
    return draftIds.has(planId) && (t.status === "done" || t.status === "blocked");
  });

  console.log(`Task aktif (todo/in_progress) milik plan draft : ${activeTasks.length}`);
  console.log(`Task histori (done/blocked) milik plan draft   : ${historyTasks.length} (dibiarkan)\n`);

  if (activeTasks.length === 0) {
    console.log("✅ Tidak ada task aktif yang perlu dihapus.");
    return;
  }

  let deleted = 0;
  for (const task of activeTasks) {
    if (APPLY) {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) console.error(`  ❌ delete ${task.id}: ${error.message}`);
      else {
        deleted++;
        console.log(`  ✕ dihapus: ${task.title || task.id} [${task.status}]`);
      }
    } else {
      console.log(`  ~ akan dihapus: ${task.title || task.id} [${task.status}]`);
    }
  }

  console.log("\n── Ringkasan ──");
  console.log(`  Task dihapus: ${APPLY ? deleted : activeTasks.length} (dari ${activeTasks.length} kandidat)`);
  console.log(APPLY ? "\n✅ Selesai (applied)." : "\nℹ️  Dry-run — jalankan dengan --apply untuk eksekusi.\n");
}

main().catch((e) => {
  console.error("❌ Gagal:", e.message);
  process.exit(1);
});