/**
 * Fix one-time: Task TPDOC "Monthly Report Client" status done → review
 * (upload terjadi sebelum fix deploy, jadi masih pakai perilaku lama)
 * Ambil task_id dari monthly_reports client TPDOC periode 8/2026, lalu update.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = fs.readFileSync(envPath, "utf8");
const envMap = Object.fromEntries(
  env
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const supabase = createClient(
  envMap.NEXT_PUBLIC_SUPABASE_URL,
  envMap.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function main() {
  // 1. Cari monthly report TPDOC
  const { data: report, error: rErr } = await supabase
    .from("monthly_reports")
    .select("id, task_id, period_month, period_year, client:clients(name)")
    .eq("period_month", 8)
    .eq("period_year", 2026)
    .maybeSingle();

  if (rErr || !report) {
    console.log("❌ Report tidak ditemukan:", rErr?.message || "not found");
    return;
  }

  console.log(`📄 Report ditemukan: [${report.period_month}/${report.period_year}] client=${report.client?.name} task_id=${report.task_id}`);
  if (!report.task_id) {
    console.log("⚠️ Report tidak ter-link ke task mana pun — selesai.");
    return;
  }

  // 2. Cek status task sekarang
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, status")
    .eq("id", report.task_id)
    .single();

  console.log(`📋 Task: "${task?.title}" | status saat ini: ${task?.status}`);

  if (task?.status === "done") {
    // 3. Update ke review
    const { error: uErr } = await supabase
      .from("tasks")
      .update({ status: "review", result: "Monthly report uploaded — menunggu review presentasi ke client" })
      .eq("id", task.id);

    if (uErr) {
      console.log("❌ Gagal update:", uErr.message);
      return;
    }
    console.log("✅ Status task diupdate: done → review");
    console.log("🎯 Task sekarang akan muncul lagi di board kolom Review & widget My Tasks dashboard");
  } else {
    console.log(`ℹ️ Status sudah "${task?.status}" — tidak perlu diubah`);
  }
}

main();