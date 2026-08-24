#!/usr/bin/env node
/**
 * merge-duplicate-clients.mjs — gabungkan client duplikat ke client utama.
 *
 * Mapping dikonfirmasi user 2026-08-24:
 *   - "Seminar Kulit"        → "Seminar Kit"   (typo saat import)
 *   - "Kurma Ayyuwa"         → "AYYUWA Store"  (salah nama)
 *   - "Bolu Pisang bu Winda" → "Bolu Kukis"    (salah nama)
 * (Tree Top Up & Nouban CPAS memang client terpisah — TIDAK digabung.)
 *
 * Mekanisme (aman):
 *   1. Resolve ID kedua client by exact name (skip jika tidak ketemu).
 *   2. Probe tabel mana saja yang punya kolom client_id.
 *   3. BACKUP semua baris terdampak ke JSON (selalu, termasuk dry-run).
 *   4. UPDATE client_id: dup → keep (data dipindah, isi baris tidak disentuh).
 *   5. Hapus client duplikat HANYA jika 0 referensi tersisa.
 *   6. Verifikasi akhir: re-count per client utama + total client.
 *
 * Usage:
 *   node scripts/merge-duplicate-clients.mjs --dry-run
 *   node scripts/merge-duplicate-clients.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import fs from "fs";

config({ path: ".env.local" });
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preview");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MERGES = [
  { dup: "Seminar Kulit", keep: "Seminar Kit" },
  { dup: "Kurma Ayyuwa", keep: "AYYUWA Store" },
  { dup: "Bolu Pisang bu Winda", keep: "Bolu Kukis" },
];

// Kandidat tabel dengan kolom client_id (di-probe saat runtime)
const GUESS_TABLES = [
  "ads_content_clusters", "ads_creative_requests", "tasks", "reports", "invoices",
  "contracts", "client_communication_log", "client_content", "content_plans",
  "client_principles", "client_competitors", "client_social_accounts",
  "monthly_reports", "leads", "ad_accounts", "client_strategies",
  "client_initiatives", "client_okrs", "expenses", "timesheets",
];

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — tidak ada perubahan\n" : "🚀 Merge client duplikat\n");

  // 1. Resolve client IDs (exact name match, case/punctuation-insensitive)
  const { data: allClients, error: clErr } = await sb.from("clients").select("id,name,created_at");
  if (clErr) throw new Error(clErr.message);
  const byName = new Map((allClients || []).map((c) => [norm(c.name), c]));

  const pairs = [];
  for (const m of MERGES) {
    const d = byName.get(norm(m.dup));
    const k = byName.get(norm(m.keep));
    if (!d) { console.log(`⚠️ DUP "${m.dup}" tidak ditemukan — skip`); continue; }
    if (!k) { console.log(`⚠️ KEEP "${m.keep}" tidak ditemukan — skip "${m.dup}"`); continue; }
    pairs.push({ ...m, dupId: d.id, keepId: k.id });
  }
  if (!pairs.length) { console.log("Tidak ada pasangan valid — selesai."); return; }

  // 2. Probe tabel dengan client_id
  const tables = [];
  for (const t of GUESS_TABLES) {
    const { error } = await sb.from(t).select("client_id").limit(1);
    if (!error) tables.push(t);
  }
  console.log(`Tabel dengan client_id (${tables.length}): ${tables.join(", ")}\n`);

  // 3. Backup semua baris terdampak
  const backup = { created_at: new Date().toISOString(), dry_run: DRY_RUN, pairs: [] };
  for (const p of pairs) {
    const entry = {
      dup: p.dup, keep: p.keep, dup_id: p.dupId, keep_id: p.keepId,
      dup_client_row: allClients.find((c) => c.id === p.dupId) || null,
      rows: {},
    };
    for (const t of tables) {
      const { data } = await sb.from(t).select("*").eq("client_id", p.dupId);
      if (data && data.length) entry.rows[t] = data;
    }
    backup.pairs.push(entry);
    const summary = Object.entries(entry.rows).map(([t, r]) => `${t}:${r.length}`).join(", ") || "TIDAK ADA DATA";
    console.log(`📦 ${p.dup} → ${p.keep}: ${summary}`);
  }
  const bf = `scripts/backup-merge-dup-clients-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(bf, JSON.stringify(backup, null, 2));
  console.log(`\n💾 Backup lengkap: ${bf}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Selesai — jalankan tanpa --dry-run untuk eksekusi.");
    return;
  }

  // 4. Re-point client_id dup → keep (per tabel yang punya data)
  for (const p of pairs) {
    for (const t of tables) {
      const { data } = await sb.from(t).select("id").eq("client_id", p.dupId).limit(1);
      if (!data || !data.length) continue;
      const { error } = await sb.from(t).update({ client_id: p.keepId }).eq("client_id", p.dupId);
      if (error) {
        console.log(`❌ ${p.dup} ${t}: ${error.message} — pasangan ini DIHENTIKAN (restore manual via backup)`);
        break;
      }
      console.log(`✅ ${p.dup} → ${p.keep}: ${t} client_id di-update`);
    }
  }

  // 5. Hapus client duplikat HANYA jika 0 referensi tersisa
  for (const p of pairs) {
    let remaining = 0;
    for (const t of tables) {
      const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("client_id", p.dupId);
      if (count) remaining += count;
    }
    if (remaining > 0) {
      console.log(`⚠️ "${p.dup}" masih punya ${remaining} referensi — client TIDAK dihapus`);
      continue;
    }
    const { error } = await sb.from("clients").delete().eq("id", p.dupId);
    if (error) console.log(`⚠️ Hapus "${p.dup}" gagal (${error.message}) — data sudah dipindah, baris client dibiarkan`);
    else console.log(`🗑️ Client "${p.dup}" dihapus`);
  }

  // 6. Verifikasi akhir
  const { count: total } = await sb.from("clients").select("id", { count: "exact", head: true });
  console.log(`\n📊 Total client sekarang: ${total}`);
  for (const p of pairs) {
    const entry = backup.pairs.find((x) => x.dup_id === p.dupId);
    const counts = [];
    for (const t of Object.keys(entry.rows)) {
      const { count } = await sb.from(t).select("id", { count: "exact", head: true }).eq("client_id", p.keepId);
      counts.push(`${t}:${count}`);
    }
    console.log(`🔎 ${p.keep} sekarang → ${counts.join(", ") || "tidak ada data"}`);
  }
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});