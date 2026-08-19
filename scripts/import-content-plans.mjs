#!/usr/bin/env node
/**
 * Import 4 Content Plan sheets client (TPDOC, SHUMI Japan, Threenine, Hadona)
 * langsung ke Supabase content_plans — dari terminal, bypass RLS (service role).
 *
 * Usage:
 *   node scripts/import-content-plans.mjs --dry-run          # preview saja
 *   node scripts/import-content-plans.mjs                    # insert
 *   node scripts/import-content-plans.mjs --replace          # hapus bulan tsb dulu, lalu insert
 *   node scripts/import-content-plans.mjs --month 2026-09    # override bulan
 *   node scripts/import-content-plans.mjs --client tpdoc     # satu client saja
 *
 * Prasyarat: sheet di-share "Anyone with link → Viewer" atau Publish to web.
 * Env: NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di .env.local
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Load .env.local ────────────────────────────────────────
function loadEnv() {
  const txt = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local");
  process.exit(1);
}
const REST = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// ── CLI flags ──────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REPLACE = args.includes("--replace");
const MONTH =
  args.find((a) => a.startsWith("--month="))?.split("=")[1] ||
  (args.indexOf("--month") >= 0 ? args[args.indexOf("--month") + 1] : null) ||
  new Date().toISOString().slice(0, 7); // default: bulan berjalan YYYY-MM
const CLIENT_FILTER = (
  args.find((a) => a.startsWith("--client="))?.split("=")[1] ||
  (args.indexOf("--client") >= 0 ? args[args.indexOf("--client") + 1] : "") ||
  ""
).toLowerCase();

// ── 4 sheet client ─────────────────────────────────────────
const SHEETS = [
  { key: "tpdoc", label: "TPDOC", sheetId: "1ZdxDJO9UB0UgCjgpxlR2HcF6v5mhZhFMijkKqEP_3XI", gid: "851155289", match: ["tpdoc"] },
  { key: "shumi", label: "SHUMI Japan", sheetId: "1I21UCuSa0vCA8JgqNs46YzUK8nR182YwHX5RUIMtBWk", gid: "1294953188", match: ["shumi"] },
  { key: "threenine", label: "Threenine", sheetId: "1Mv1rvTsiwi2OZPRvlL-Da-8TVpy5ESWJ5CB0ob9afiU", gid: "396219623", match: ["threenine", "three nine", "3nine", "tn"] },
  { key: "hadona", label: "Hadona", sheetId: "1jiZivO_nNEdZ2vB_ZvGJ_EO2Rfp-fFcDbcOTr-7kQaI", gid: "702190412", match: ["hadona"] },
].filter((s) => !CLIENT_FILTER || s.key.includes(CLIENT_FILTER) || s.label.toLowerCase().includes(CLIENT_FILTER) || s.match.some((m) => m.includes(CLIENT_FILTER)));

if (SHEETS.length === 0) {
  console.error(`❌ Client "${CLIENT_FILTER}" tidak dikenal. Gunakan: tpdoc | shumi | threenine | hadona`);
  process.exit(1);
}

// ── CSV fetch & parse (identik dengan API route) ───────────
function csvUrls(sheetId, gid) {
  return [
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
  ];
}

async function fetchCsv(sheetId, gid, label) {
  for (const url of csvUrls(sheetId, gid)) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Macintosh)" } });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().startsWith("<") || !text.trim()) continue; // HTML login page
      return text;
    } catch {
      /* coba endpoint berikutnya */
    }
  }
  throw new Error(`Gagal mengambil sheet ${label}. Pastikan di-share "Anyone with the link → Viewer" (atau Publish to web).`);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n") {
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

// ── Header normalization (EN/ID variants) ─────────────────
const HEADER_MAP = {
  no: "no", "no.": "no",
  pillar: "pilar", pilar: "pilar",
  tipe: "konten", "tipe konten": "konten", konten: "konten",
  tema: "tema",
  copy: "copy",
  details: "details", detail: "details",
  referensi: "reference", reference: "reference", "link referensi": "reference",
  caption: "caption",
  thumbnail: "thumbnail",
  progress: "progress",
  "link hasil": "link_hasil", hasil: "link_hasil",
  "tanggal unggah": "tanggal_upload", "tanggal upload": "tanggal_upload", "tgl upload": "tanggal_upload", date: "tanggal_upload",
};
function normalizeHeader(h) {
  return HEADER_MAP[String(h).toLowerCase().trim().replace(/\s+/g, " ")] || null;
}

function extractRows(grid) {
  if (grid.length < 2) return [];
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const map = {};
    grid[i].forEach((h, idx) => {
      const norm = normalizeHeader(h);
      if (norm && !(norm === "no" && Object.values(map).includes("no"))) map[idx] = norm;
    });
    if (Object.keys(map).length >= 2) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const out = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    const obj = {};
    Object.entries(colMap).forEach(([idx, field]) => {
      obj[field] = row[Number(idx)] || "";
    });
    if (!Object.values(obj).some((v) => v)) continue;
    out.push(obj);
  }
  return out;
}

// ── Value normalizers ──────────────────────────────────────
function normalizeProgress(v) {
  const lower = String(v).toLowerCase().trim();
  if (["done", "selesai", "wrapped", "terpublish", "published"].includes(lower)) return "done";
  if (["cancel", "cancelled", "canceled", "dibatalkan"].includes(lower)) return "cancel";
  return "proses_edit";
}

const MONTHS_ID = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "aug", "sep", "okt", "oct", "nov", "des", "dec"];
function normalizeDate(v) {
  const t = String(v).trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const words = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (words) {
    const lower = words[2].toLowerCase();
    const mIdx = MONTHS_ID.indexOf(lower.slice(0, 3));
    if (mIdx >= 0) {
      let monthNum;
      if (lower.startsWith("agu") || lower.startsWith("aug")) monthNum = "08";
      else {
        const m = (mIdx % 12) + 1;
        monthNum = String(m).padStart(2, "0");
      }
      return `${words[3]}-${monthNum}-${words[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function normalizeUrl(v) {
  const t = String(v).trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

// ── Supabase helpers (PostgREST via fetch) ────────────────
async function resolveClientIds() {
  const res = await fetch(`${REST}/clients?select=id,name&limit=500`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Gagal ambil clients: HTTP ${res.status} ${await res.text()}`);
  const clients = await res.json();
  const byKey = {};
  for (const s of SHEETS) {
    const found = clients.find((c) => {
      const n = String(c.name || "").toLowerCase();
      return s.match.some((m) => n.includes(m));
    });
    if (found) byKey[s.key] = found;
    else console.warn(`⚠️  Client "${s.label}" tidak ditemukan di tabel clients (dilewati)`);
  }
  return byKey;
}

async function insertWithFallback(inserts, label) {
  let current = inserts;
  for (let attempt = 0; attempt <= 5; attempt++) {
    const res = await fetch(`${REST}/content_plans`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(current),
    });
    if (res.ok) return { count: current.length, skipped: [] };
    const errText = await res.text();
    const m = errText.match(/Could not find the '([^']+)' column/);
    if (m && current.some((r) => m[1] in r)) {
      current = current.map((r) => {
        const c = { ...r };
        delete c[m[1]];
        return c;
      });
      continue;
    }
    throw new Error(`${label}: ${errText}`);
  }
  throw new Error(`${label}: terlalu banyak retry fallback kolom`);
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`\n📦 Import Content Plans → Supabase`);
  console.log(`   Mode    : ${DRY_RUN ? "🔮 DRY-RUN (tidak insert)" : REPLACE ? "🔄 REPLACE + INSERT" : "➕ INSERT"}`);
  console.log(`   Bulan   : ${MONTH}`);
  console.log(`   Clients : ${SHEETS.map((s) => s.label).join(", ")}\n`);

  const clientMap = await resolveClientIds();

  let totalInserted = 0;
  const failures = [];

  for (const s of SHEETS) {
    const client = clientMap[s.key];
    if (!client) {
      failures.push(`${s.label}: client tidak ada di DB`);
      continue;
    }
    process.stdout.write(`▶ ${s.label} … `);
    try {
      const csv = await fetchCsv(s.sheetId, s.gid, s.label);
      const rows = extractRows(parseCsv(csv));
      const inserts = rows
        .map((r) => ({
          pilar: r.pilar || "",
          konten: r.konten || "",
          tema: r.tema || "",
          copy: r.copy || "",
          details: r.details || "",
          caption: r.caption || "",
          thumbnail: r.thumbnail || "",
          progress: r.progress || "",
        }))
        .filter((r) => r.pilar || r.tema || r.copy || r.caption || r.details)
        .map((r) => ({
          client_id: client.id,
          month: MONTH,
          pilar: r.pilar || null,
          konten: r.konten || null,
          tema: r.tema || null,
          copy: r.copy || null,
          details: r.details || null,
          reference: null,
          caption: r.caption || null,
          thumbnail: r.thumbnail || null,
          link_hasil: null,
          tanggal_upload: null,
          progress: normalizeProgress(r.progress),
          status: "active",
          services: [],
        }));

      if (inserts.length === 0) {
        console.log(`⚠️  0 baris valid (header tidak dikenali?)`);
        failures.push(`${s.label}: 0 baris valid`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`✅ ${inserts.length} baris terdeteksi (dry-run, tidak diinsert)`);
        // sample
        inserts.slice(0, 3).forEach((r) => {
          console.log(`   · pilar="${r.pilar}" konten="${(r.konten || "").slice(0, 30)}" progress=${r.progress}`);
        });
        continue;
      }

      if (REPLACE) {
        const del = await fetch(
          `${REST}/content_plans?client_id=eq.${client.id}&month=eq.${MONTH}`,
          { method: "DELETE", headers: { ...HEADERS, Prefer: "return=minimal" } }
        );
        if (!del.ok) console.log(`\n   ⚠️ delete lama gagal: HTTP ${del.status} (lanjut insert)`);
      }

      const { count, skipped } = await insertWithFallback(inserts, s.label);
      totalInserted += count;
      console.log(`✅ ${count} baris diinsert${skipped.length ? ` (kolom ${skipped.join(", ")} dilewati)` : ""}`);
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failures.push(`${s.label}: ${err.message}`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (DRY_RUN) {
    console.log(`🔮 Dry-run selesai. Jalankan tanpa --dry-run untuk insert asli.`);
  } else {
    console.log(`🎉 Selesai: ${totalInserted} baris diinsert untuk bulan ${MONTH}.`);
  }
  if (failures.length) {
    console.log(`\n⚠️  Gagal (${failures.length}):`);
    failures.forEach((f) => console.log(`   - ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});