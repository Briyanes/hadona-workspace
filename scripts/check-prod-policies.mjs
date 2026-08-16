/**
 * Cek policy tasks & task_assignes di PRODUCTION + siapa pembuat report 8/2026
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const envMap = Object.fromEntries(
  env.split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const supabase = createClient(envMap.NEXT_PUBLIC_SUPABASE_URL, envMap.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("══ POLICY tasks & task_assignees di PRODUCTION ══");
  const { data: policies } = await supabase
    .from("pg_policies")
    .select("tablename, policyname, cmd, qual, with_check")
    .in("tablename", ["tasks", "task_assignees"]);
  for (const p of policies || []) {
    console.log(`\n[${p.tablename}] ${p.policyname} (${p.cmd})`);
    console.log(`  USING: ${p.qual}`);
    console.log(`  CHECK: ${p.with_check}`);
  }

  console.log("\n══ REPORT 8/2026: siapa pembuatnya ══");
  const { data: reports } = await supabase
    .from("monthly_reports")
    .select("id, task_id, created_by, file_name, created_at");
  for (const r of reports || []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role, division")
      .eq("id", r.created_by)
      .single();
    console.log(`• oleh=${profile?.full_name} (role=${profile?.role}) pada ${r.created_at} | file=${r.file_name}`);
  }

  console.log("\n══ TASK 153e51e4: created_by & assignees ══");
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, status, result, created_by")
    .eq("id", "153e51e4-07fc-456d-8162-eee3dc8c317c")
    .single();
  if (task) {
    const { data: creator } = await supabase
      .from("profiles").select("full_name, role").eq("id", task.created_by).single();
    console.log(`• "${task.title}" status=${task.status} | result=${task.result || "-"} | creator=${creator?.full_name} (${creator?.role})`);
    const { data: asg } = await supabase
      .from("task_assignees").select("user:profiles(full_name)").eq("task_id", task.id);
    console.log(`• assignees: ${(asg || []).map((a) => a.user?.full_name).join(", ") || "-"}`);
  }
}

main();