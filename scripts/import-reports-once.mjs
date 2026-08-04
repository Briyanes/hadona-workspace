#!/usr/bin/env node
/**
 * 🔥 ONE-SHOT IMPORT: Google Sheet → Dashboard Reports
 * ============================================================================
 * Memindahkan SEMUA data dari published Google Spreadsheet ke tabel
 * weekly_reports + report_metrics. Dipakai SEKALI untuk migrasi data historis.
 *
 * Sumber: https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg.../pub?output=csv
 *
 * Author: Tim Hadona (3 Advertiser + 5 Web Dev + 2 UI/UX)
 * ============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";

// Load env
const envFile = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envFile.split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY di .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================================
// HELPER FUNCTIONS (dipindahkan dari src/lib/sheet-parser.ts agar script self-contained)
// ============================================================================

const METRIC_ALIASES = {
  "spend": { key: "amount_spent", unit: "currency" },
  "biaya": { key: "amount_spent", unit: "currency" },
  "total spend": { key: "amount_spent", unit: "currency" },
  "amount spent": { key: "amount_spent", unit: "currency" },
  "cost per result": { key: "cost_per_result", unit: "currency" },
  "cost per results": { key: "cost_per_result", unit: "currency" },
  "cpr": { key: "cost_per_result", unit: "currency" },
  "cost per message": { key: "cost_per_message", unit: "currency" },
  "cost per purchase": { key: "cost_per_purchase", unit: "currency" },
  "cost per cv": { key: "cost_per_cv", unit: "currency" },
  "cost per lpv": { key: "cost_per_lpv", unit: "currency" },
  "cost per atc": { key: "cost_per_atc", unit: "currency" },
  "cost per checkout": { key: "cost_per_checkout", unit: "currency" },
  "cpm": { key: "cpm", unit: "currency" },
  "cpc": { key: "cpc_all", unit: "currency" },
  "cpc all": { key: "cpc_all", unit: "currency" },
  "cpc link": { key: "cpc_link", unit: "currency" },
  "cpv": { key: "cpv", unit: "currency" },
  "cpi": { key: "cpi", unit: "currency" },
  "vcpm": { key: "vcpm", unit: "currency" },
  "aov": { key: "aov", unit: "currency" },
  "results": { key: "results", unit: "number" },
  "result": { key: "results", unit: "number" },
  "result purchase": { key: "purchases", unit: "number" },
  "result purches": { key: "purchases", unit: "number" },
  "result purchases": { key: "purchases", unit: "number" },
  "purchases": { key: "purchases", unit: "number" },
  "purchase": { key: "purchases", unit: "number" },
  "result wa": { key: "messaging_conversations_started", unit: "number" },
  "result whatsapp": { key: "messaging_conversations_started", unit: "number" },
  "wa leads": { key: "messaging_conversations_started", unit: "number" },
  "wa lead": { key: "messaging_conversations_started", unit: "number" },
  "messaging conversations started": { key: "messaging_conversations_started", unit: "number" },
  "conversions": { key: "conversions", unit: "number" },
  "conversion": { key: "conversions", unit: "number" },
  "leads": { key: "results", unit: "number" },
  "impressions": { key: "impressions", unit: "number" },
  "imprestion": { key: "impressions", unit: "number" },
  "impression": { key: "impressions", unit: "number" },
  "reach": { key: "reach", unit: "number" },
  "clicks": { key: "clicks_all", unit: "number" },
  "click": { key: "clicks_all", unit: "number" },
  "clicks all": { key: "clicks_all", unit: "number" },
  "clicks (all)": { key: "clicks_all", unit: "number" },
  "link clicks": { key: "link_clicks", unit: "number" },
  "link click": { key: "link_clicks", unit: "number" },
  "outbound clicks": { key: "outbound_clicks", unit: "number" },
  "landing page views": { key: "landing_page_views", unit: "number" },
  "lpv": { key: "landing_page_views", unit: "number" },
  "content views": { key: "content_views", unit: "number" },
  "cv": { key: "content_views", unit: "number" },
  "adds to cart": { key: "adds_to_cart", unit: "number" },
  "add to cart": { key: "adds_to_cart", unit: "number" },
  "atc": { key: "adds_to_cart", unit: "number" },
  "checkouts initiated": { key: "checkouts_initiated", unit: "number" },
  "checkout initiated": { key: "checkouts_initiated", unit: "number" },
  "video views": { key: "video_views", unit: "number" },
  "result new follower ig": { key: "instagram_follows", unit: "number" },
  "result new follower": { key: "instagram_follows", unit: "number" },
  "new follower ig": { key: "instagram_follows", unit: "number" },
  "new follower": { key: "instagram_follows", unit: "number" },
  "instagram follows": { key: "instagram_follows", unit: "number" },
  "ig follow": { key: "instagram_follows", unit: "number" },
  "ig follower": { key: "instagram_follows", unit: "number" },
  "instagram profile visits": { key: "instagram_profile_visits", unit: "number" },
  "ig profile visits": { key: "instagram_profile_visits", unit: "number" },
  "profile visits": { key: "profile_visits_tt", unit: "number" },
  "engagement rate": { key: "engagement_rate", unit: "percent" },
  "ctr": { key: "ctr_all", unit: "percent" },
  "ctr all": { key: "ctr_all", unit: "percent" },
  "ctr (all)": { key: "ctr_all", unit: "percent" },
  "ctr link": { key: "ctr_link", unit: "percent" },
  "vtr": { key: "vtr", unit: "percent" },
  "view through rate": { key: "vtr", unit: "percent" },
  "frequency": { key: "frequency", unit: "ratio" },
  "freq": { key: "frequency", unit: "ratio" },
  "purchase roas": { key: "purchase_roas", unit: "ratio" },
  "roas": { key: "purchase_roas", unit: "ratio" },
  "purchase value": { key: "purchase_value", unit: "currency" },
  "add to cart value": { key: "add_to_cart_value", unit: "currency" },
  "avg watch time": { key: "avg_watch_time", unit: "number" },
  "app installs": { key: "app_installs", unit: "number" },
  "quality score": { key: "quality_score", unit: "ratio" },
  "impression share": { key: "impression_share", unit: "percent" },
  "revenue": { key: "revenue", unit: "currency" },
  "pendapatan": { key: "revenue", unit: "currency" },
};

function normalizeNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/^(rp|idr|\$|usd)\s*/i, "");
  s = s.replace(/\s*(rb|ribu|jt|juta|m)\b.*$/i, "");
  s = s.replace(/[×x]%$/, "").replace(/[×x]$/, "").replace(/%$/, "").trim();
  s = s.replace(/\s+/g, "");
  if (!s || !/[0-9]/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3 && parts.length > 1) s = s.replace(/,/g, "");
    else if (parts.length === 2 && lastPart.length <= 2) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasDot) {
    const parts = s.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3 && parts.length > 1) s = s.replace(/\./g, "");
  }
  const num = Number(s);
  return isNaN(num) ? null : num;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const numMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (numMatch) {
    let year = Number(numMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(numMatch[2]) - 1, Number(numMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const monthMap = {
    january: 0, jan: 0, januari: 0,
    february: 1, feb: 1, februari: 1,
    march: 2, mar: 2, maret: 2,
    april: 3, apr: 3,
    may: 4, mei: 4,
    june: 5, jun: 5, juni: 5,
    july: 6, jul: 6, juli: 6,
    august: 7, aug: 7, agustus: 7, agt: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9, oktober: 9, okt: 9,
    november: 10, nov: 10,
    december: 11, dec: 11, desember: 11, des: 11,
  };
  const textMatch = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (textMatch) {
    const month = monthMap[textMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Number(textMatch[3]), month, Number(textMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function extractPeriod(text) {
  if (!text) return { start: null, end: null, raw: "" };
  const s = String(text);
  const re = /(\d{1,2})\s*(?:s\/d|sampai|to|-|\u2013|\u2014)\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i;
  const m = s.match(re);
  if (m) {
    const startDay = Number(m[1]);
    const endDay = Number(m[2]);
    let year = Number(m[4]);
    if (year < 100) year += 2000;
    const month = Number(m[3]) - 1;
    return {
      start: new Date(year, month, startDay),
      end: new Date(year, month, endDay),
      raw: s,
    };
  }
  const re2 = /(\d{1,2})\s*[\-]\s*(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/;
  const m2 = s.match(re2);
  if (m2) {
    const monthMap = {
      jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5,
      jul: 6, agu: 7, aug: 7, agt: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
      januari: 0, februari: 1, maret: 2, april: 3, juni: 5, juli: 6,
      agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
      january: 0, february: 1, march: 2, june: 5, july: 6,
      august: 7, october: 9, december: 11,
    };
    const month = monthMap[m2[3].toLowerCase()];
    if (month !== undefined) {
      return {
        start: new Date(Number(m2[4]), month, Number(m2[1])),
        end: new Date(Number(m2[4]), month, Number(m2[2])),
        raw: s,
      };
    }
  }
  return { start: null, end: null, raw: s };
}

function detectPlatform(text) {
  if (!text) return "unknown";
  const s = text.toLowerCase();
  if (/\b(meta|facebook|fb ads|instagram|ig ads)\b/.test(s)) return "meta";
  if (/\b(google|gg|gg ads|gdn|search|pmax|performance max|youtube)\b/.test(s)) return "google";
  if (/\b(tiktok|tt|ttk|bytedance)\b/.test(s)) return "tiktok";
  return "unknown";
}

function mapMetricLabel(rawLabel) {
  if (!rawLabel) return null;
  const normalized = rawLabel.toLowerCase().trim()
    .replace(/[:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^:\s*/, "");
  if (METRIC_ALIASES[normalized]) return METRIC_ALIASES[normalized];
  const stripped = normalized.replace(/\([^)]*\)/g, "").trim();
  if (METRIC_ALIASES[stripped]) return METRIC_ALIASES[stripped];
  return null;
}

function detectObjective(metrics, platform) {
  const keys = new Set(metrics.map(m => m.key));
  const hasPurchases = keys.has("purchases");
  const hasWA = keys.has("messaging_conversations_started");
  const hasLPV = keys.has("landing_page_views");
  const hasROAS = keys.has("purchase_roas");
  const hasVideoViews = keys.has("video_views");
  const hasFollows = keys.has("instagram_follows");
  const hasProfileVisits = keys.has("instagram_profile_visits");
  const hasReach = keys.has("reach");
  if (platform === "google") {
    if (hasVideoViews) return "GOOGLE_YOUTUBE";
    if (hasROAS && hasPurchases) return "GOOGLE_PMAX";
    return "GOOGLE_SEARCH";
  }
  if (platform === "tiktok") {
    if (hasVideoViews) return "TIKTOK_VIDEO_VIEWS";
    if (hasROAS || hasPurchases) return "TIKTOK_GMX_MAX";
    return "TIKTOK_WEB_CONV";
  }
  if (platform === "meta") {
    if (hasROAS) return "META_SALES";
    if (hasPurchases) return "META_SALES";
    if (hasLPV) return "META_CTLP";
    if (hasWA) return "META_CTWA";
    if (hasFollows || hasProfileVisits) return "META_ENGAGEMENT";
    if (hasReach && !hasPurchases && !hasWA) return "META_AWARENESS";
    return "META_CTWA";
  }
  if (hasWA) return "META_CTWA";
  if (hasPurchases || hasROAS) return "META_SALES";
  return "META_CTWA";
}

function computeAcronym(s) {
  const words = s.split(/\s+/).filter(w => w.length > 0);
  const stop = new Set(["the", "and", "of", "for", "to", "in", "on", "at", "by"]);
  const acr = words.filter(w => !stop.has(w)).map(w => w[0]).join("");
  return acr.toLowerCase();
}

function matchClientFuzzy(sheetName, dbClients) {
  if (!sheetName) return null;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const target = normalize(sheetName);
  if (!target) return null;
  const targetAcronym = computeAcronym(target);
  const targetNoSpace = target.replace(/\s/g, "");

  // 1) Exact match
  for (const c of dbClients) {
    if (normalize(c.name) === target) return { id: c.id, name: c.name, confidence: 1.0 };
  }
  // 2) Acronym match (e.g., "YBD" → "Your Best Deal")
  if (targetAcronym.length >= 2 && targetNoSpace.length <= 6) {
    for (const c of dbClients) {
      const cn = computeAcronym(normalize(c.name));
      if (cn === targetAcronym) return { id: c.id, name: c.name, confidence: 0.92 };
    }
  }
  // 3) Substring match (target adalah substring atau vice versa)
  let best = null;
  for (const c of dbClients) {
    const cn = normalize(c.name);
    if (!cn) continue;
    if (cn.includes(target) || target.includes(cn)) {
      const score = Math.min(cn.length, target.length) / Math.max(cn.length, target.length);
      if (!best || score > best.confidence) best = { id: c.id, name: c.name, confidence: 0.85 * score };
    }
  }
  if (best && best.confidence >= 0.6) return best;
  // 4) Levenshtein similarity untuk sisa
  let levBest = null;
  for (const c of dbClients) {
    const cn = normalize(c.name);
    if (!cn) continue;
    const dist = levenshtein(target, cn);
    const maxLen = Math.max(target.length, cn.length);
    const sim = 1 - dist / maxLen;
    if (!levBest || sim > levBest.confidence) {
      levBest = { id: c.id, name: c.name, confidence: sim };
    }
  }
  if (levBest && levBest.confidence >= 0.75) return levBest;
  return null;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// ============================================================================
// MAIN IMPORT LOGIC
// ============================================================================

function parseRow(cells, rowIndex) {
  const first = (cells[0] || "").toString().toLowerCase().trim();
  if (first === "no" || first === "no." || first === "number" || first === "input date" || first === "date" || first === "tanggal") {
    return null; // header
  }

  // Detect schema: row[0] = "1" (No) atau langsung tanggal?
  let schema;
  const isNoCol = /^\d+$/.test((cells[0] || "").trim()) && cells.length >= 9;
  if (isNoCol) {
    schema = { no: 0, date: 1, client: 2, pic: 3, division: 4, performance: 5, analysis: 6, status: 7 };
  } else {
    schema = { no: -1, date: 0, client: 1, pic: 2, division: 3, performance: 4, analysis: 5, status: 7 };
  }

  const dateRaw = cells[schema.date] || "";
  const clientName = (cells[schema.client] || "").trim();
  const picName = (cells[schema.pic] || "").trim();
  const performanceText = cells[schema.performance] || "";
  const analysisText = cells[schema.analysis] || "";
  const statusRaw = (cells[schema.status] || "").trim().toLowerCase();

  if (!clientName && !performanceText) return null;

  const date = parseDate(dateRaw);
  const periodInfo = extractPeriod(performanceText);
  const platform = detectPlatform(performanceText);

  // Parse metrics
  const metrics = [];
  const lines = performanceText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(meta|google|tiktok)\s+ads/i.test(trimmed)) continue;
    if (/^(value|growth|kesimpulan)\s*[:=]/i.test(trimmed)) continue;
    if (/^(analisa|analisis|note|catatan|solusi|solving|komentar|remarks|conclusion)\s*[:=]/i.test(trimmed)) continue;
    const m = trimmed.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const rawLabel = m[1].trim();
    const rawValue = m[2].trim();
    if (/s\/d|sampai/.test(rawValue)) continue;
    if (!/\d/.test(rawValue)) continue;
    if (rawValue.split(/\s+/).length > 8) continue;
    const mapped = mapMetricLabel(rawLabel);
    const value = normalizeNumber(rawValue);
    if (value === null) continue;
    if (mapped) {
      const existingIdx = metrics.findIndex(x => x.key === mapped.key);
      const entry = { key: mapped.key, rawLabel, value, unit: mapped.unit };
      if (existingIdx >= 0) metrics[existingIdx] = entry;
      else metrics.push(entry);
    } else {
      const fallbackKey = rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
      const entry = { key: fallbackKey || `metric_${metrics.length}`, rawLabel, value, unit: "number" };
      const existingIdx = metrics.findIndex(x => x.key === entry.key);
      if (existingIdx >= 0) metrics[existingIdx] = entry;
      else metrics.push(entry);
    }
  }

  const detectedObjective = metrics.length > 0 ? detectObjective(metrics, platform) : "";

  const STATUS_MAP = {
    send: "submitted", sent: "submitted", submitted: "submitted", submit: "submitted",
    draft: "draft", drafts: "draft", reviewed: "reviewed", review: "reviewed",
    approved: "reviewed", done: "reviewed", pending: "draft",
  };
  const status = STATUS_MAP[statusRaw] || "submitted";

  // Fallback period: kalau extractPeriod gagal, pakai date input sebagai period
  let periodStart = periodInfo.start;
  let periodEnd = periodInfo.end;
  if (!periodStart && date) {
    periodStart = date;
    periodEnd = new Date(date);
    periodEnd.setDate(periodEnd.getDate() + 6); // 1 minggu
  }

  return {
    rowIndex, date, clientName, picName,
    platform: platform === "unknown" ? "META" : platform.toUpperCase(),
    detectedObjective,
    periodStart, periodEnd,
    metrics, analysisText, status,
    rawPerformanceText: performanceText,
  };
}

async function main() {
  console.log("🚀 ONE-SHOT IMPORT: Google Sheet → Dashboard Reports");
  console.log("=".repeat(70));
  console.log(`📡 URL: ${SHEET_URL.substring(0, 70)}...`);
  console.log();

  // ─── Step 1: Fetch CSV ──────────────────────────────────────────────────
  console.log("⬇️  Step 1: Fetching CSV...");
  const res = await fetch(SHEET_URL, { redirect: "follow" });
  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${res.statusText}`);
    process.exit(1);
  }
  const csvText = await res.text();
  const records = parseCsv(csvText, { relax_column_count: true, skip_empty_lines: true, trim: true });
  console.log(`   ✅ Fetched ${records.length} rows`);

  // ─── Step 2: Load DB clients & profiles ─────────────────────────────────
  console.log("⬇️  Step 2: Loading DB clients & profiles...");
  const [{ data: dbClients }, { data: dbProfiles }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  console.log(`   ✅ ${dbClients.length} clients, ${dbProfiles.length} profiles`);

  // Default PIC: admin user (fallback kalau PIC di sheet tidak match)
  const ADMIN_PIC = dbProfiles.find(p => p.full_name === "admin" || p.email?.includes("admin")) || dbProfiles[0];
  console.log(`   👤 Default PIC (fallback): ${ADMIN_PIC.full_name} (${ADMIN_PIC.id})`);

  // ─── Step 3: Load existing reports (composite key) ──────────────────────
  console.log("⬇️  Step 3: Loading existing reports...");
  const existingReports = new Map();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("id, client_id, period_start, period_end, platform")
      .range(offset, offset + 999);
    if (error) {
      console.error("❌ Error loading existing reports:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const key = `${r.client_id}|${r.period_start}|${r.period_end}|${r.platform || "META"}`;
      existingReports.set(key, r.id);
    }
    offset += 1000;
    if (data.length < 1000) break;
  }
  console.log(`   ✅ ${existingReports.size} existing reports in DB`);

  // ─── Step 4: Parse & match ──────────────────────────────────────────────
  console.log("⬇️  Step 4: Parsing CSV rows...");
  const stats = {
    parsed: 0, skippedEmpty: 0, skippedHeader: 0,
    noClientMatch: 0, noPeriod: 0,
    alreadyExists: 0, inserted: 0, insertErrors: 0,
    metricsInserted: 0,
  };
  const unmatchedClients = new Set();
  const rowsToInsert = [];

  for (let i = 0; i < records.length; i++) {
    const cells = records[i];
    const parsed = parseRow(cells, i);
    if (!parsed) {
      if (cells[0]?.toLowerCase().trim() === "no" || cells[0]?.toLowerCase().trim() === "input date") {
        stats.skippedHeader++;
      } else {
        stats.skippedEmpty++;
      }
      continue;
    }
    stats.parsed++;

    // Match client
    const matched = matchClientFuzzy(parsed.clientName, dbClients);
    if (!matched) {
      unmatchedClients.add(parsed.clientName);
      stats.noClientMatch++;
      continue;
    }

    // Skip kalau tidak ada period start
    if (!parsed.periodStart || !parsed.periodEnd) {
      stats.noPeriod++;
      continue;
    }

    const periodStartISO = parsed.periodStart.toISOString().split("T")[0];
    const periodEndISO = parsed.periodEnd.toISOString().split("T")[0];
    const reportKey = `${matched.id}|${periodStartISO}|${periodEndISO}|${parsed.platform}`;

    if (existingReports.has(reportKey)) {
      stats.alreadyExists++;
      continue;
    }

    rowsToInsert.push({
      matched,
      parsed,
      periodStartISO,
      periodEndISO,
      reportKey,
    });
  }

  console.log(`   ✅ Parsed: ${stats.parsed} rows valid`);
  console.log(`   ⏭️  Skipped (empty/header): ${stats.skippedEmpty + stats.skippedHeader}`);
  console.log(`   ⚠️  No client match: ${stats.noClientMatch}`);
  console.log(`   ⚠️  No period: ${stats.noPeriod}`);
  console.log(`   ⏭️  Already exists in DB: ${stats.alreadyExists}`);
  console.log(`   📦 To insert: ${rowsToInsert.length} rows`);
  if (unmatchedClients.size > 0) {
    console.log(`\n   ⚠️  Unmatched clients (${unmatchedClients.size}):`);
    for (const c of [...unmatchedClients].slice(0, 15)) {
      console.log(`       - "${c}"`);
    }
    if (unmatchedClients.size > 15) console.log(`       ... and ${unmatchedClients.size - 15} more`);
  }
  console.log();

  if (rowsToInsert.length === 0) {
    console.log("✨ Nothing to insert. All data already in DB or unmatched.");
    return;
  }

  // ─── Step 5: Insert reports ─────────────────────────────────────────────
  console.log("⬇️  Step 5: Inserting reports (batch 25)...");
  const BATCH_SIZE = 25;
  const insertedReportIds = new Map(); // reportKey → id

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    const payload = batch.map(b => ({
      client_id: b.matched.id,
      pic_id: ADMIN_PIC.id,
      period_start: b.periodStartISO,
      period_end: b.periodEndISO,
      summary: `Weekly report - ${b.parsed.clientName} (${b.parsed.platform})`,
      performance_text: b.parsed.rawPerformanceText,
      conclusion: b.parsed.analysisText || null,
      action: null,
      status: b.parsed.status,
      platform: b.parsed.platform,
      objective: b.parsed.detectedObjective || null,
      source_sheet_url: SHEET_URL,
      sheet_source: "manual-import-once",
      last_synced_at: new Date().toISOString(),
    }));

    const { data: inserted, error } = await supabase
      .from("weekly_reports")
      .insert(payload)
      .select("id, client_id, period_start, period_end, platform");

    if (error) {
      console.error(`❌ Batch ${i / BATCH_SIZE + 1} error:`, error.message);
      // Try inserting one by one to find which row failed
      for (let j = 0; j < payload.length; j++) {
        const single = payload[j];
        const { data: singleIns, error: singleErr } = await supabase
          .from("weekly_reports")
          .insert(single)
          .select("id, client_id, period_start, period_end, platform")
          .maybeSingle();
        if (singleErr) {
          console.error(`   Row ${i + j} "${batch[j].parsed.clientName}" ${batch[j].periodStartISO} ${batch[j].parsed.platform}: ${singleErr.message}`);
          stats.insertErrors++;
        } else if (singleIns) {
          insertedReportIds.set(`${singleIns.client_id}|${singleIns.period_start}|${singleIns.period_end}|${singleIns.platform}`, singleIns.id);
          stats.inserted++;
        }
      }
    } else if (inserted) {
      for (const r of inserted) {
        insertedReportIds.set(`${r.client_id}|${r.period_start}|${r.period_end}|${r.platform}`, r.id);
        stats.inserted++;
      }
    }
    process.stdout.write(`\r   Inserted ${stats.inserted}/${rowsToInsert.length}...`);
  }
  console.log();
  console.log(`   ✅ Inserted: ${stats.inserted}, Errors: ${stats.insertErrors}`);

  // ─── Step 6: Insert metrics ─────────────────────────────────────────────
  console.log("⬇️  Step 6: Inserting metrics...");
  const metricsPayload = [];
  for (const r of rowsToInsert) {
    const reportId = insertedReportIds.get(r.reportKey);
    if (!reportId) continue;
    for (const m of r.parsed.metrics) {
      metricsPayload.push({
        weekly_report_id: reportId,
        metric_type: m.key,
        value: m.value,
        platform: r.parsed.platform,
      });
    }
  }
  console.log(`   📊 Total metrics to insert: ${metricsPayload.length}`);

  // Insert metrics in batches of 200
  for (let i = 0; i < metricsPayload.length; i += 200) {
    const batch = metricsPayload.slice(i, i + 200);
    const { error } = await supabase.from("report_metrics").insert(batch);
    if (error) {
      console.error(`❌ Metrics batch ${i / 200 + 1} error:`, error.message);
      // Try one-by-one
      for (const m of batch) {
        const { error: e2 } = await supabase.from("report_metrics").insert(m);
        if (!e2) stats.metricsInserted++;
      }
    } else {
      stats.metricsInserted += batch.length;
    }
    process.stdout.write(`\r   Metrics ${stats.metricsInserted}/${metricsPayload.length}...`);
  }
  console.log();

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log();
  console.log("=".repeat(70));
  console.log("📊 IMPORT SUMMARY");
  console.log("=".repeat(70));
  console.log(`   Total CSV rows:        ${records.length}`);
  console.log(`   Parsed valid:          ${stats.parsed}`);
  console.log(`   Skipped (empty/hdr):   ${stats.skippedEmpty + stats.skippedHeader}`);
  console.log(`   No client match:       ${stats.noClientMatch}`);
  console.log(`   No period:             ${stats.noPeriod}`);
  console.log(`   Already in DB:         ${stats.alreadyExists}`);
  console.log(`   ✅ Reports INSERTED:    ${stats.inserted}`);
  console.log(`   ❌ Insert errors:       ${stats.insertErrors}`);
  console.log(`   ✅ Metrics INSERTED:    ${stats.metricsInserted}`);
  console.log();
  console.log(`🌐 Dashboard: https://workspace.hadona.id/reports`);
  console.log("=".repeat(70));
}

main().catch(err => {
  console.error("💥 FATAL:", err);
  process.exit(1);
});