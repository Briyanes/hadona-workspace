#!/usr/bin/env node
/**
 * Isi OKR template untuk semua client yang belum punya OKR (0 baris).
 * Idempotent: hanya INSERT untuk client kosong, tidak pernah menyentuh OKR existing.
 *
 * Usage:
 *   node scripts/fill-okr-templates.mjs --dry-run   (preview)
 *   node scripts/fill-okr-templates.mjs             (apply)
 *
 * Template disusun per klaster industri (pola 2 Objective x 4 Key Results,
 * konsisten dengan gaya OKR client aktif yang sudah ada di database).
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

// ---- env ----
const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const dryRun = process.argv.includes("--dry-run");

// ===================== TEMPLATE PER KLASTER INDUSTRI =====================
const T = {
  fnb: [
    {
      objective: "Meningkatkan awareness dan engagement lokal melalui sosial media",
      krs: [
        "Mencapai 500.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 4% di seluruh konten",
        "Memproduksi minimal 16 konten (video & desain) per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan sales melalui iklan CTWA dan pesanan online",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan pesanan online (WhatsApp & delivery) sebesar 15% per bulan",
        "Mencapai ROAS minimal 3",
        "Menjaga CPA di bawah target per kategori produk",
      ],
    },
  ],
  fashion_retail: [
    {
      objective: "Meningkatkan traffic dan interaction melalui sosial media",
      krs: [
        "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 16 konten (video & desain) per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan sales melalui iklan CPAS dan Marketplace",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan GMV e-commerce sebesar 15% per bulan",
        "Mencapai ROAS minimal 3",
        "Menjaga CPA di bawah target per kategori produk",
      ],
    },
  ],
  beauty_health: [
    {
      objective: "Meningkatkan awareness dan edukasi produk melalui sosial media",
      krs: [
        "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 12 konten edukasi (video & desain) per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan sales melalui iklan CTWA dan CPAS",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan penjualan produk sebesar 15% per bulan",
        "Mencapai ROAS minimal 3",
        "Menjaga CPA di bawah target per kategori produk",
      ],
    },
  ],
  travel_hospitality: [
    {
      objective: "Meningkatkan awareness melalui Media Sosial",
      krs: [
        "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 16 konten (video & desain) per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan leads dan booking melalui iklan CTWA dan Lead Form",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan leads & booking sebesar 15% per bulan",
        "Menjaga CPL (cost per lead) di bawah target",
        "Meningkatkan closing rate leads minimal 10%",
      ],
    },
  ],
  education: [
    {
      objective: "Meningkatkan awareness dan komunitas belajar melalui sosial media",
      krs: [
        "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 16 konten edukasi per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan registrasi peserta melalui iklan Lead Form",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan registrasi peserta sebesar 15% per bulan",
        "Menjaga CPL (cost per lead) di bawah target",
        "Meningkatkan closing rate pendaftaran minimal 10%",
      ],
    },
  ],
  finance: [
    {
      objective: "Membangun kepercayaan dan awareness brand melalui sosial media",
      krs: [
        "Mencapai 200.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 12 konten edukasi keuangan per bulan sesuai kalender",
      ],
    },
    {
      objective: "Menghasilkan qualified leads melalui iklan Lead Form",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan qualified leads sebesar 15% per bulan",
        "Menjaga CPL (cost per lead) di bawah target",
        "Meningkatkan closing rate leads minimal 10%",
      ],
    },
  ],
  gaming_ent: [
    {
      objective: "Meningkatkan traffic dan virality konten melalui sosial media",
      krs: [
        "Mencapai 500.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
        "Mencapai engagement rate minimal 4% di seluruh konten",
        "Memproduksi minimal 16 konten (video & desain) per bulan sesuai kalender",
      ],
    },
    {
      objective: "Meningkatkan sales melalui iklan META dan Google",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan penjualan (top-up & produk) sebesar 15% per bulan",
        "Mencapai ROAS minimal 3",
        "Menjaga CPA di bawah target per kategori produk",
      ],
    },
  ],
  b2b: [
    {
      objective: "Meningkatkan kredibilitas dan awareness brand melalui sosial media",
      krs: [
        "Mencapai 200.000 views konten TikTok & Instagram Reels per bulan",
        "Meningkatkan followers Instagram & TikTok sebesar 8% per bulan",
        "Mencapai engagement rate minimal 3% di seluruh konten",
        "Memproduksi minimal 12 konten portofolio & edukasi per bulan sesuai kalender",
      ],
    },
    {
      objective: "Menghasilkan leads berkualitas melalui iklan Meta Lead Form",
      krs: [
        "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
        "Meningkatkan leads berkualitas sebesar 15% per bulan",
        "Menjaga CPL (cost per lead) di bawah target",
        "Meningkatkan closing rate leads minimal 10%",
      ],
    },
  ],
};

// ===================== MAPPING INDUSTRI -> KLASTER =====================
function clusterFor(industry, name) {
  const i = (industry || "").toLowerCase();
  const n = (name || "").toLowerCase();
  const hay = `${i} ${n}`;
  if (/food|f&b|beverage|chocolate|kurma|baby|cookie|seblak|kuliner|resto|caff|bakery/.test(hay)) return "fnb";
  if (/fashion|retail|apparel|store|cincin|acces|accessor|electronic|book/.test(hay)) return "fashion_retail";
  if (/lifestyle|cosmetic|hair|health|wellness|beauty|skin|well|salon|spa/.test(hay)) return "beauty_health";
  if (/tour|travel|vila|villa|hotel|hospitality/.test(hay)) return "travel_hospitality";
  if (/education|academy|kursus|sekolah/.test(hay)) return "education";
  if (/finance|tax|pajak/.test(hay)) return "finance";
  if (/gaming|entertainment|game/.test(hay)) return "gaming_ent";
  return "b2b"; // kontraktor, construction, transportation, digital, agency, lainnya
}

// ===================== MAIN =====================
const { data: clients, error: e1 } = await sb.from("clients").select("id, name, industry").order("name");
if (e1) { console.error("clients error:", e1.message); process.exit(1); }
const { data: okrs, error: e2 } = await sb.from("okrs").select("client_id");
if (e2) { console.error("okrs error:", e2.message); process.exit(1); }

const hasOkr = new Set((okrs || []).map((o) => o.client_id));
const targets = clients.filter((c) => !hasOkr.has(c.id));

const now = new Date();
const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;
const year = now.getFullYear();

console.log(`\n${dryRun ? "🔍 DRY RUN — " : ""}Client tanpa OKR: ${targets.length} dari ${clients.length} total\n`);

const summary = {};
let totalRows = 0;
for (const c of targets) {
  const cl = clusterFor(c.industry, c.name);
  const tpl = T[cl];
  summary[cl] = (summary[cl] || 0) + 1;
  console.log(`  [${cl}] ${c.name} (${c.industry || "-"}) — ${tpl.length} objective, ${tpl.reduce((a, o) => a + o.krs.length, 0)} KR`);

  if (dryRun) { totalRows += tpl.reduce((a, o) => a + o.krs.length, 0); continue; }

  const rows = [];
  for (const o of tpl) {
    for (const kr of o.krs) {
      rows.push({
        client_id: c.id,
        objective: o.objective,
        key_result: kr,
        kr_type: "lagging",
        quarter,
        year,
        target_value: null,
        baseline_value: 0,
        actual_value: 0,
        unit: null,
        metric_name: null,
        progress_pct: 0,
        status: "behind",
      });
    }
  }
  const { error } = await sb.from("okrs").insert(rows);
  if (error) { console.error(`  ❌ ${c.name}: ${error.message}`); process.exit(1); }
  totalRows += rows.length;
}

console.log(`\n📊 RINGKASAN:`);
for (const [cl, cnt] of Object.entries(summary)) console.log(`  ${cl}: ${cnt} client`);
console.log(`  Total baris OKR ${dryRun ? "yang akan di-insert" : "ter-insert"}: ${totalRows}`);
if (dryRun) console.log("\n🔍 DRY RUN — tidak ada data yang ditulis. Jalankan tanpa --dry-run untuk apply.");
else console.log("\n✅ Selesai. OKR existing tidak tersentuh.");