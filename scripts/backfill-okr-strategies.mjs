#!/usr/bin/env node
/**
 * Backfill OKR strategis untuk client yang kosong / belum lengkap.
 *
 * House-style (mengikuti pola sheet "Objective Key Result Client"):
 *   Objective A - Awareness : "Meningkatkan traffic dan interaction melalui sosial media"
 *   Objective B - Sales     : "Meningkatkan sales melalui iklan <kanal sesuai industry>"
 *
 * Scope default : client ACTIVE + ONBOARDING + 3 client top-up (1 objective saja)
 * Flag --all    : semua client (inactive dapat template generik per industry)
 *
 * Safety:
 *   - Hanya INSERT, tidak pernah menghapus KR existing
 *   - Client yang sudah punya objective tertentu -> objective itu di-skip (idempotent)
 *   - Default dry-run; --apply untuk eksekusi
 *
 * Usage:
 *   node scripts/backfill-okr-strategies.mjs            -> dry-run
 *   node scripts/backfill-okr-strategies.mjs --apply    -> eksekusi
 *   node scripts/backfill-okr-strategies.mjs --apply --all
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");
const all = process.argv.includes("--all");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- Blok KR standar (dapat dipakai ulang) ----------
const KRS = {
  traffic: (views, growth) => [
    `Mencapai ${views} views konten TikTok & Instagram Reels per bulan`,
    `Meningkatkan followers Instagram & TikTok sebesar ${growth}% per bulan`,
    "Mencapai engagement rate minimal 3% di seluruh konten",
    "Memproduksi minimal 20 konten (video & desain) per bulan sesuai kalender",
  ],
  budget: "Menyerap 100% budget iklan (sesuai kontrak) setiap bulan",
  roas: (min) => `Mencapai ROAS minimal ${min}`,
  cpl: (max) => `Menjaga CPL di bawah Rp ${max}`,
};

// ---------- Peta kurasi (nama client dinormalisasi) ----------
const CURATED = {
  // ===== ACTIVE - Tour & Travel (pola THU) =====
  "23 trans & tour": [
    { objective: "Meningkatkan awareness melalui Media Sosial", krs: [
      "Mencapai 500.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
      "Memproduksi minimal 20 konten promosi paket tour per bulan",
    ]},
    { objective: "Meningkatkan sales melalui iklan CTWA dan Lead Form", krs: [
      KRS.budget,
      "Menghasilkan 300 chat/leads WhatsApp per bulan",
      KRS.cpl("10.000"),
      "Mencapai closing minimal 30 pemesanan paket tour per bulan",
    ]},
  ],
  "eja tour and travel": [
    { objective: "Meningkatkan awareness melalui Media Sosial", krs: [
      "Mencapai 500.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
      "Memproduksi minimal 20 konten promosi paket travel per bulan",
    ]},
    { objective: "Meningkatkan sales melalui iklan CTWA dan Lead Form", krs: [
      KRS.budget,
      "Menghasilkan 300 chat/leads WhatsApp per bulan",
      KRS.cpl("10.000"),
      "Meningkatkan closing rate chat menjadi leads minimal 20%",
    ]},
  ],
  "tombo ati": [
    { objective: "Meningkatkan awareness melalui Media Sosial", krs: [
      "Mencapai 500.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
      "Memproduksi minimal 20 konten religi & promosi travel per bulan",
    ]},
    { objective: "Meningkatkan sales melalui iklan CTWA", krs: [
      KRS.budget,
      "Menghasilkan 250 chat/leads WhatsApp per bulan",
      KRS.cpl("15.000"),
      "Mencapai closing minimal 25 pendaftar perjalanan per bulan",
    ]},
  ],

  // ===== ACTIVE - Produk / Consumer =====
  "raha pro": [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: KRS.traffic("400.000", "10") },
    { objective: "Meningkatkan sales melalui iklan CPAS dan Marketplace", krs: [
      KRS.budget,
      "Meningkatkan penjualan marketplace sebesar 20% per bulan",
      KRS.roas("3"),
      "Menjaga ACOS marketplace di bawah 25%",
    ]},
  ],
  "shumi japan": [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: KRS.traffic("400.000", "10") },
    { objective: "Meningkatkan sales melalui iklan CTWA dan CPAS", krs: [
      KRS.budget,
      "Menghasilkan 200 chat/leads WhatsApp per bulan",
      "Meningkatkan penjualan marketplace sebesar 15% per bulan",
      KRS.roas("3"),
    ]},
  ],
  "threenine (36)": [
    { objective: "Meningkatkan traffic dan followers", krs: KRS.traffic("400.000", "15") },
    { objective: "Meningkatkan sales melalui iklan CPAS", krs: [
      KRS.budget,
      "Meningkatkan penjualan marketplace sebesar 20% per bulan",
      KRS.roas("3"),
      KRS.cpl("12.000"),
    ]},
  ],
  yourbestdeal: [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: KRS.traffic("1.000.000", "10") },
    { objective: "Meningkatkan sales melalui iklan META dan Google", krs: [
      KRS.budget,
      "Meningkatkan GMV e-commerce sebesar 20% per bulan",
      KRS.roas("4"),
      "Menjaga CPA di bawah target per kategori produk",
    ]},
  ],

  // ===== ACTIVE - Jasa / B2B =====
  tpdoc: [
    { objective: "Meningkatkan awareness melalui Media Sosial", krs: [
      "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
      "Memproduksi minimal 16 konten edukasi layanan per bulan",
    ]},
    { objective: "Meningkatkan sales melalui iklan Meta Lead Form", krs: [
      KRS.budget,
      "Menghasilkan 150 qualified leads per bulan",
      KRS.cpl("25.000"),
      "Meningkatkan konversi leads menjadi klien minimal 10%",
    ]},
  ],

  // ===== ONBOARDING =====
  "moone bakery and caffe": [
    { objective: "Meningkatkan awareness lokal melalui Media Sosial", krs: [
      "Mencapai 200.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 15% per bulan",
      "Memproduksi minimal 20 konten produk & storefront per bulan",
    ]},
    { objective: "Meningkatkan sales melalui iklan CTWA", krs: [
      KRS.budget,
      "Menghasilkan 200 chat/leads WhatsApp per bulan",
      KRS.cpl("8.000"),
      "Meningkatkan order online sebesar 20% per bulan",
    ]},
  ],

  // ===== TOP-UP client yang baru punya 1 objective =====
  "jalan d rusia": [
    { objective: "Meningkatkan sales melalui iklan TikTok", krs: [
      KRS.budget,
      "Menghasilkan 200 chat/leads per bulan",
      "Meningkatkan konversi viewer menjadi klik profil minimal 5%",
      KRS.cpl("10.000"),
    ]},
  ],
  "rmoda autospa kelapa gading": [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: KRS.traffic("200.000", "10") },
  ],
  "tree top game": [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: [
      "Mencapai 300.000 views konten TikTok & Instagram Reels per bulan",
      "Meningkatkan followers Instagram & TikTok sebesar 10% per bulan",
      "Memproduksi minimal 16 konten gaming & promo per bulan",
    ]},
  ],
};

// ---------- Template generik per industry (untuk --all / client non-kurasi) ----------
function genericByIndustry(industry) {
  const ind = (industry || "").toLowerCase();
  const isProduct = /food|f&b|fashion|retail|cosmetic|skin|hair|care|consumer|electronic|chocolate|kurma|baby|accesories|cincin|e-commerce|gaming/.test(ind);
  const isB2B = /finance|education|academy|jasa|kontraktor|construction|transport|digital|agency/.test(ind);
  const objB = isProduct
    ? "Meningkatkan sales melalui iklan CPAS dan CTWA"
    : isB2B
      ? "Meningkatkan sales melalui iklan Meta Lead Form"
      : "Meningkatkan sales melalui iklan CTWA";
  return [
    { objective: "Meningkatkan traffic dan interaction melalui sosial media", krs: KRS.traffic("300.000", "10") },
    { objective: objB, krs: [KRS.budget, "Menghasilkan 150 chat/leads per bulan", KRS.roas("3"), KRS.cpl("15.000")] },
  ];
}

// ---------- main ----------
const { data: clients, error: e1 } = await sb.from("clients").select("id, name, industry, status").order("name");
if (e1 || !clients) { console.error("❌ fetch clients:", e1?.message); process.exit(1); }
const { data: okrs, error: e2 } = await sb.from("okrs").select("client_id, objective");
if (e2) { console.error("❌ fetch okrs:", e2.message); process.exit(1); }

// objective yang sudah dimiliki per client (normalized)
const has = {};
for (const o of okrs || []) {
  has[o.client_id] = has[o.client_id] || new Set();
  has[o.client_id].add(norm(o.objective));
}

const now = new Date();
const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;
const year = now.getFullYear();

console.log(`\n📦 Backfill OKR — ${apply ? "MODE APPLY" : "DRY RUN"}${all ? " (--all)" : ""}\n`);

const toInsert = [];
let processed = 0, skippedScope = 0;

for (const c of clients) {
  const n = norm(c.name);
  const curated = Object.entries(CURATED).find(([k]) => norm(k) === n)?.[1];

  // scope: --all -> semua; default -> active/onboarding ATAU client yang ada di kurasi (top-up)
  const inScope = all || c.status === "active" || c.status === "onboarding" || !!curated;
  if (!inScope) { skippedScope++; continue; }

  const plan = curated || genericByIndustry(c.industry);
  const existing = has[c.id] || new Set();
  // Guard: house-style = 2 objective. Client yang sudah >= 2 objective dianggap lengkap
  if (existing.size >= 2) { console.log(`  [SKIP] ${c.name} — sudah ${existing.size} objective (lengkap), skip`); continue; }
  const news = plan.filter((p) => !existing.has(norm(p.objective)));

  if (!news.length) { console.log(`  ⏭️  ${c.name} — lengkap, skip`); continue; }

  console.log(`  ➕ ${c.name} [${c.status}] — tambah ${news.length} objective:`);
  for (const p of news) {
    console.log(`       • ${p.objective}`);
    for (const kr of p.krs) {
      console.log(`          - ${kr}`);
      toInsert.push({
        client_id: c.id, objective: p.objective, key_result: kr,
        quarter, year, baseline_value: 0, actual_value: 0,
        kr_type: "lagging", progress_pct: 0, status: "behind",
      });
    }
  }
  processed++;
}

console.log(`\n📊 RINGKASAN:`);
console.log(`  Client diproses : ${processed}`);
console.log(`  KR baru total   : ${toInsert.length}`);
console.log(`  Client di luar scope (di-skip): ${skippedScope}`);

if (!apply) { console.log("\n🔍 DRY RUN — tidak ada data ditulis. Jalankan --apply untuk eksekusi."); process.exit(0); }

const BATCH = 100;
for (let i = 0; i < toInsert.length; i += BATCH) {
  const { error } = await sb.from("okrs").insert(toInsert.slice(i, i + BATCH));
  if (error) { console.error(`❌ insert batch gagal: ${error.message}`); process.exit(1); }
}
console.log(`\n✅ ${toInsert.length} KR baru ditulis (${quarter} ${year}) — cek /strategy`);