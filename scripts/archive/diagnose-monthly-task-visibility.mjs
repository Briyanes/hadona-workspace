/**
 * Diagnostik: kenapa task Monthly Report tidak terlihat pindah ke Review
 * untuk user scope Advertising/Advertiser.
 * Dump: semua task terkait monthly report + assignees + division + pembuat,
 * plus daftar user dengan division Advertiser.
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
  console.log("════════ 1. SEMUA TASK (latest 20) ════════");
  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select(
      `id, title, status, division, priority, due_date, created_at, created_by,
       client:clients(name),
       task_assignees(user_id, user:profiles(full_name, division))`
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (tErr) {
    console.log("❌ Error tasks:", tErr.message);
    return;
  }

  for (const t of tasks) {
    const assignees = (t.task_assignees || [])
      .map((a) => a.user?.full_name || "unknown")
      .join(", ") || "TIDAK ADA ASSIGNEE";
    console.log(
      `• [${t.status}] "${t.title}" | client=${t.client?.name || "-"} | div=${t.division || "-"} | oleh=${t.created_by ? "user" : "-"} | assignee: ${assignees} | due=${t.due_date || "-"} | id=${t.id.slice(0, 8)}`
    );
  }

  console.log("\n════════ 2. TASK TER-LINK DARI MONTHLY_REPORTS ════════");
  const { data: reports } = await supabase
    .from("monthly_reports")
    .select("id, task_id, period_month, period_year, status, file_name");
  for (const r of reports || []) {
    console.log(`• report ${r.period_month}/${r.period_year} → task_id=${r.task_id} | status=${r.status}`);
  }

  console.log("\n════════ 3. USERS DENGAN DIVISION TERKAT ADVERTIS ════════");
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, division, role, status");
  for (const p of profiles || []) {
    const divs = Array.isArray(p.division) ? p.division.join(", ") : p.division;
    if ((divs || "").toLowerCase().includes("advertis")) {
      console.log(`• ${p.full_name} <${p.email}> | div=${divs} | role=${p.role} | status=${p.status} | id=${p.id}`);
    }
  }

  console.log("\n════════ 4. KESELARASAN: task monthly report vs assignee advertiser ════════");
  const monthlyTaskIds = (reports || []).map((r) => r.task_id).filter(Boolean);
  for (const tid of monthlyTaskIds) {
    const task = tasks.find((t) => t.id === tid);
    if (!task) {
      console.log(`• task ${tid.slice(0, 8)} TIDAK ADA di 20 task terbaru! (mungkin lebih tua)`);
      continue;
    }
    const advAssignees = (task.task_assignees || []).filter((a) => {
      const d = Array.isArray(a.user?.division) ? a.user.division.join(",") : a.user?.division || "";
      return d.toLowerCase().includes("advertis");
    });
    console.log(
      `• "${task.title}" status=${task.status} | assignee advertiser: ${advAssignees.length ? advAssignees.map((a) => a.user.full_name).join(", ") : "TIDAK ADA"}`
    );
  }
}

main();