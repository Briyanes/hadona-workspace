/**
 * DIAGNOSIS: Bug drag task board (Ovi) — card tidak berpindah.
 *
 * Hipotesis: RLS `tasks_update_assignee_or_manager` menolak update secara diam-diam
 * (PostgREST return 200 dengan 0 rows), lalu loadTasks() me-reset card ke posisi lama.
 *
 * Script ini memeriksa (via SERVICE_ROLE, read-only):
 *  1. Profil "Ovi" — role & id
 *  2. Berapa banyak task yang TIDAK bisa dia update menurut aturan RLS
 *  3. Definisi policy tasks UPDATE yang aktif di produksi
 *
 * Run: node scripts/diagnose-drag-permission.mjs
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function rpc(fn, body) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Profile": "public",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  // 1. Cari profil Ovi (fuzzy: full_name ILIKE ovi)
  const profiles = await query(
    "profiles",
    "?select=id,full_name,role,division&full_name=ilike.*ovi*&limit=5"
  );
  console.log("=== PROFIL 'OVI' ===");
  if (!profiles.length) console.log("(tidak ditemukan profil berisi 'ovi')");
  for (const p of profiles) console.log(p);

  // 2. Policy UPDATE aktif pada tasks (pg_meta via RPC jika tersedia)
  console.log("\n=== POLICY tasks (produksi) ===");
  try {
    const policies = await rpc("exec_sql", {
      query: "SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='tasks';",
    });
    console.log(JSON.stringify(policies, null, 2));
  } catch (e) {
    console.log("exec_sql tidak tersedia →", e.message.slice(0, 120));
  }

  // 3. Untuk tiap kandidat Ovi: hitung task yang tidak bisa di-update
  for (const p of profiles) {
    try {
      const counts = await rpc("exec_sql", {
        query: `SELECT
          (SELECT count(*) FROM tasks) AS total,
          (SELECT count(*) FROM tasks WHERE created_by = '${p.id}') AS as_creator,
          (SELECT count(*) FROM tasks t WHERE EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id='${p.id}')) AS as_assignee,
          (SELECT count(*) FROM tasks t WHERE NOT (t.created_by='${p.id}' OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=t.id AND ta.user_id='${p.id}'))) AS blocked_count;`,
      });
      console.log(`\n=== STATISTIK UNTUK ${p.full_name} (role=${p.role}) ===`);
      console.log(counts);
    } catch (e) {
      console.log("statistik gagal →", e.message.slice(0, 120));
    }
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});