/**
 * Cleanup duplicate "Membuat monthly report All Client" tasks (created 2026-08-14 in ~90s by admin).
 * Keeps the FINAL task (00819779, division "Creative Director" — admin's last intent),
 * deletes the 5 earlier duplicates (division "Editor").
 * FKs use ON DELETE CASCADE so child rows clean up automatically.
 * Full backup of deleted rows is written to scripts/backup-monthly-report-dupes-*.json
 *
 * Usage: node scripts/cleanup-monthly-report-dupes.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "fs";

// load .env.local
readFileSync(".env.local", "utf8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
});

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

const KEEP = "00819779-4b8f-4d8d-a978-c70ea61fec73";
const DELETE = [
  "834558ed-b797-469d-b3d5-8c5c0b43323c", // 04:16:29 Editor
  "ddeef17a-a9ef-4b47-a40e-93d7934b1ba4", // 04:16:51 Editor
  "a99e8044-3ef9-4973-b969-8a04264a7dd5", // 04:17:04 Editor
  "a2b7363e-df59-454f-98ea-86d344d6bbef", // 04:17:21 Editor
  "610a038e-8b48-4e53-ac4d-0d94a3645369", // 04:17:36 Editor
];
const DRY = process.argv.includes("--dry-run");

const api = async (path, opts = {}) => {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: H, ...opts });
  const text = await r.text();
  const body = text ? JSON.parse(text) : null; // 204 No Content has empty body
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text}`);
  return body;
};

// Fetch full rows (all columns) for backup
const all = [...DELETE, KEEP];
const rows = await api(
  `/tasks?id=in.(${all.join(",")})&select=*`
);
console.log(`Fetched ${rows.length} rows for audit.`);
// A previous partial run may have already deleted some dupes — that's fine.
const fetchedIds = new Set(rows.map((r) => r.id));
if (!fetchedIds.has(KEEP)) {
  console.error("KEEP row missing — aborting. Inspect DB first.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = `scripts/backup-monthly-report-dupes-${stamp}.json`;
writeFileSync(backupFile, JSON.stringify(rows, null, 2));
console.log(`Backup written: ${backupFile}`);

if (DRY) {
  console.log("DRY RUN — no deletion performed.");
  console.table(rows.map((r) => ({ id: r.id, division: r.division, status: r.status, created: r.created_at, title: r.title.slice(0, 60) })));
  process.exit(0);
}

// Delete duplicates one by one (service role bypasses RLS)
for (const id of DELETE) {
  await api(`/tasks?id=eq.${id}`, { method: "DELETE" });
  console.log(`Deleted ${id}`);
}

// Verify
const remaining = await api(`/tasks?id=in.(${all.join(",")})&select=id,division,status`);
console.log("\nRemaining of the 6:");
console.table(remaining);
console.log(remaining.length === 1 && remaining[0].id === KEEP ? "✅ CLEANUP OK — only final task remains (Creative Director)" : "⚠️ CHECK RESULT");