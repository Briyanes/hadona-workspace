/**
 * 📊 Google Sheet Parser Engine
 * ============================================================================
 * Engine untuk parse weekly report dari Google Spreadsheet yang di-publish.
 *
 * Author: Tim Hadona (konsensus 3 Advertiser + 5 Web Dev + 2 UI/UX)
 *
 * Komponen:
 *   1. fetchSheetCSV()     — fetch & parse CSV dari URL Google Sheet
 *   2. parseRow()          — extract data terstruktur dari 1 baris sheet
 *   3. normalizeNumber()   — handle format "Rp1.234.567" / "IDR 1,234,567" / "1.51%" / "1,35%"
 *   4. detectPlatform()    — detect Meta/Google/TikTok dari prefix cell
 *   5. detectObjective()   — heuristic berdasarkan metric yang ada
 *   6. extractPeriod()     — extract period start/end dari text "19 s/d 25/1/26"
 *   7. mapMetricLabel()    — alias dictionary raw label → MetricKey
 * ============================================================================
 */

import { parse } from "csv-parse/sync";

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedMetric {
  /** Metric key yang sudah di-map (mis. "amount_spent") atau raw key jika tidak ada di alias */
  key: string;
  /** Label asli dari sheet (untuk display & debug) */
  rawLabel: string;
  /** Value yang sudah dinormalisasi ke number */
  value: number;
  /** Unit inferensi: currency / number / percent / ratio */
  unit: "currency" | "number" | "percent" | "ratio";
}

export interface ParsedRow {
  rowIndex: number;
  /** Date di kolom "Input Date" / "Date" (tanggal input report) */
  date: Date | null;
  /** Teks nama client mentah */
  clientName: string;
  /** Teks PIC mentah */
  picName: string;
  /** Divisi (Advertiser, Social Media, dll) */
  division: string;
  /** Platform yang ter-detect */
  platform: "meta" | "google" | "tiktok" | "unknown";
  /** Objective yang ter-detect secara heuristic */
  detectedObjective: string;
  /** Period dari text (mis. "19 s/d 25/1/26" → start & end) */
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Period raw text (mis. "Meta ADS - 19 s/d 25/1/26") */
  periodRawText: string;
  /** Semua metric yang berhasil di-parse */
  metrics: ParsedMetric[];
  /** Teks analisa (kolom "Result Performance" / "Analisa") */
  analysisText: string;
  /** Status (Send / Draft / Reviewed) */
  status: string;
  /** Raw text performance cell (untuk debug / display) */
  rawPerformanceText: string;
  /** Errors saat parsing (warning, tidak fatal) */
  parseWarnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  totalRows: number;
  skippedHeader: boolean;
  errors: string[];
}

// ============================================================================
// METRIC ALIAS DICTIONARY (raw label → canonical MetricKey)
// ============================================================================
// Disusun oleh 3 Advertiser Expert berdasarkan real data sheet Hadona.
// Termasuk typo umum: "Result Purches", "Imprestion", trailing space, dll.

const METRIC_ALIASES: Record<string, { key: string; unit: "currency" | "number" | "percent" | "ratio" }> = {
  // ─── Spend & Cost ───
  "spend": { key: "amount_spent", unit: "currency" },
  "biaya": { key: "amount_spent", unit: "currency" },
  "total spend": { key: "amount_spent", unit: "currency" },
  "amount spent": { key: "amount_spent", unit: "currency" },
  "cost per result": { key: "cost_per_result", unit: "currency" },
  "cost per results": { key: "cost_per_result", unit: "currency" },
  "cpr": { key: "cost_per_result", unit: "currency" },
  "cost per message": { key: "cost_per_message", unit: "currency" },
  "cost per msg": { key: "cost_per_message", unit: "currency" },
  "cost per purchase": { key: "cost_per_purchase", unit: "currency" },
  "cost per cv": { key: "cost_per_cv", unit: "currency" },
  "cost per lpv": { key: "cost_per_lpv", unit: "currency" },
  "cost per atc": { key: "cost_per_atc", unit: "currency" },
  "cost per checkout": { key: "cost_per_checkout", unit: "currency" },
  "cost per follow": { key: "cost_per_follow", unit: "currency" },
  "cost per new follower": { key: "cost_per_follow", unit: "currency" },
  "cost per 1k reached": { key: "cost_per_1k_reached", unit: "currency" },
  "cpm": { key: "cpm", unit: "currency" },
  "cpc": { key: "cpc_all", unit: "currency" },
  "cpc all": { key: "cpc_all", unit: "currency" },
  "cpc link": { key: "cpc_link", unit: "currency" },
  "cpv": { key: "cpv", unit: "currency" },
  "cpi": { key: "cpi", unit: "currency" },
  "vcpm": { key: "vcpm", unit: "currency" },
  "aov": { key: "aov", unit: "currency" },

  // ─── Results & Conversions ───
  "results": { key: "results", unit: "number" },
  "result": { key: "results", unit: "number" },
  "result purchase": { key: "purchases", unit: "number" },
  "result purches": { key: "purchases", unit: "number" }, // typo
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

  // ─── Funnel ───
  "impressions": { key: "impressions", unit: "number" },
  "imprestion": { key: "impressions", unit: "number" }, // typo
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

  // ─── Engagement ───
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

  // ─── Percentages ───
  "ctr": { key: "ctr_all", unit: "percent" },
  "ctr all": { key: "ctr_all", unit: "percent" },
  "ctr (all)": { key: "ctr_all", unit: "percent" },
  "ctr link": { key: "ctr_link", unit: "percent" },
  "vtr": { key: "vtr", unit: "percent" },
  "view through rate": { key: "vtr", unit: "percent" },

  // ─── Ratios ───
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

  // ─── Custom agency metric ───
  "revenue": { key: "revenue", unit: "currency" },
  "pendapatan": { key: "revenue", unit: "currency" },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize angka dari format Indonesia / campuran.
 *
 * Contoh input:
 *   "Rp1.234.567"     → 1234567
 *   "Rp1,234,567"     → 1234567  (US format)
 *   "IDR 1.234"       → 1234
 *   "1,234,567"       → 1234567
 *   "1.234.567"       → 1234567
 *   "1.51%"           → 1.51 (percent)
 *   "1,35%"           → 1.35 (percent - ID style)
 *   "7.64%"           → 7.64
 *   "3.5x"            → 3.5
 *
 * Heuristic:
 *   - Jika ada "," DAN "." bersamaan:
 *     - Last sep adalah decimal → yang lain thousand
 *     - Detect dari posisi: jika last "," setelah last "." → ID style (1.234,56)
 *     - jika last "." setelah last "," → US style (1,234.56)
 *   - Jika hanya satu separator:
 *     - Count digit group: jika 3 → thousand, jika ≤2 → decimal
 */
export function normalizeNumber(raw: string): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip currency prefix & suffix
  s = s.replace(/^(rp|idr|\$|usd)\s*/i, "");
  s = s.replace(/\s*(rb|ribu|jt|juta|m)\b.*$/i, ""); // suffix satuan

  // Strip unit suffix
  s = s.replace(/[×x]%$/, "").replace(/[×x]$/, "").replace(/%$/, "").trim();

  // Remove spaces
  s = s.replace(/\s+/g, "");

  if (!s || !/[0-9]/.test(s)) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Ada keduanya → cek posisi terakhir
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // ID/EU style: 1.234,56 → comma = decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US style: 1,234.56 → comma = thousand
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Hanya koma → cek group
    const parts = s.split(",");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3 && parts.length > 1) {
      // 1,234 → thousand separator
      s = s.replace(/,/g, "");
    } else if (parts.length === 2 && lastPart.length <= 2) {
      // 1,5 → decimal
      s = s.replace(",", ".");
    } else {
      // Ambiguous → assume thousand (default ID)
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Hanya titik → cek group
    const parts = s.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 3 && parts.length > 1) {
      // 1.234 → thousand separator (ID style)
      s = s.replace(/\./g, "");
    } else {
      // 1.5 → decimal, biarkan
    }
  }

  const num = Number(s);
  return isNaN(num) ? null : num;
}

/**
 * Parse tanggal dari berbagai format Indonesia / EN.
 *
 * Contoh:
 *   "26 January 2026" → Date
 *   "26 Januari 2026" → Date
 *   "26/1/26"         → Date(2026-01-26)
 *   "26-1-2026"       → Date
 *   "2026-01-26"      → Date
 */
export function parseDate(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO format
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Numeric: d/m/y or d-m-y
  const numMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (numMatch) {
    let year = Number(numMatch[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(numMatch[2]) - 1, Number(numMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Text month (EN/ID)
  const monthMap: Record<string, number> = {
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

  // "26 January 2026" / "26 Jan 2026"
  const textMatch = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (textMatch) {
    const month = monthMap[textMatch[2].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Number(textMatch[3]), month, Number(textMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // "January 26, 2026"
  const textMatch2 = s.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (textMatch2) {
    const month = monthMap[textMatch2[1].toLowerCase()];
    if (month !== undefined) {
      const d = new Date(Number(textMatch2[3]), month, Number(textMatch2[2]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // Fallback: Date.parse
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Extract period start & end dari text.
 *
 * Contoh:
 *   "Meta ADS - 19 s/d 25/1/26"  → { start: 2026-01-19, end: 2026-01-25, raw: "Meta ADS - 19 s/d 25/1/26" }
 *   "Google ADS - 19 s/d 25-1-2026"
 *   "Performance 19-25 Jan 2026"
 */
export function extractPeriod(text: string): { start: Date | null; end: Date | null; raw: string } {
  if (!text) return { start: null, end: null, raw: "" };
  const s = String(text);

  // Pattern: "<d> s/d <d>/<m>/<y>" atau "<d> s/d <d>-<m>-<y>"
  // atau "sampai" instead of "s/d"
  const re = /(\d{1,2})\s*(?:s\/d|sampai|to|-|\u2013|\u2014)\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i;
  const m = s.match(re);
  if (m) {
    const startDay = Number(m[1]);
    const endDay = Number(m[2]);
    let year = Number(m[4]);
    if (year < 100) year += 2000;
    const month = Number(m[3]) - 1;
    const start = new Date(year, month, startDay);
    const end = new Date(year, month, endDay);
    return { start, end, raw: s };
  }

  // Pattern: "<d>-<d> <Month> <year>" (mis. "19-25 Jan 2026")
  const re2 = /(\d{1,2})\s*[\-]\s*(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/;
  const m2 = s.match(re2);
  if (m2) {
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5,
      jul: 6, agu: 7, aug: 7, agt: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11,
      januari: 0, februari: 1, maret: 2, april: 3, juni: 5, juli: 6,
      agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
      january: 0, february: 1, march: 2, june: 5, july: 6,
      august: 7, october: 9, december: 11,
    };
    const month = monthMap[m2[3].toLowerCase()];
    if (month !== undefined) {
      const year = Number(m2[4]);
      const start = new Date(year, month, Number(m2[1]));
      const end = new Date(year, month, Number(m2[2]));
      return { start, end, raw: s };
    }
  }

  return { start: null, end: null, raw: s };
}

/**
 * Detect platform dari prefix text.
 */
export function detectPlatform(text: string): "meta" | "google" | "tiktok" | "unknown" {
  if (!text) return "unknown";
  const s = text.toLowerCase();
  if (/\b(meta|facebook|fb ads|instagram|ig ads)\b/.test(s)) return "meta";
  if (/\b(google|gg|gg ads|gdn|search|pmax|performance max|youtube)\b/.test(s)) return "google";
  if (/\b(tiktok|tt|ttk|bytedance)\b/.test(s)) return "tiktok";
  return "unknown";
}

/**
 * Detect objective berdasarkan metric yang ada.
 * Heuristic disusun oleh 3 Advertiser Expert.
 */
export function detectObjective(
  metrics: ParsedMetric[],
  platform: string
): string {
  const keys = new Set(metrics.map((m) => m.key));
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
    if (hasROAS && hasPurchases) {
      // Search vs PMax vs Shopping - default PMAX
      return "GOOGLE_PMAX";
    }
    return "GOOGLE_SEARCH";
  }

  if (platform === "tiktok") {
    if (hasVideoViews) return "TIKTOK_VIDEO_VIEWS";
    if (hasROAS || hasPurchases) return "TIKTOK_GMX_MAX";
    return "TIKTOK_WEB_CONV";
  }

  if (platform === "meta") {
    // Priority: CPAS / Sales > CTLP > CTWA > Engagement
    if (hasROAS) return "META_SALES";
    if (hasPurchases) return "META_SALES";
    if (hasLPV) return "META_CTLP";
    if (hasWA) return "META_CTWA";
    if (hasFollows || hasProfileVisits) return "META_ENGAGEMENT";
    if (hasReach && !hasPurchases && !hasWA) return "META_AWARENESS";
    return "META_CTWA"; // default fallback for Meta
  }

  // Unknown platform → generic
  if (hasWA) return "META_CTWA";
  if (hasPurchases || hasROAS) return "META_SALES";
  return "META_CTWA";
}

/**
 * Map raw metric label ke MetricKey via alias dictionary.
 * Returns null jika tidak ditemukan (caller boleh skip atau simpan raw).
 */
export function mapMetricLabel(rawLabel: string): { key: string; unit: "currency" | "number" | "percent" | "ratio" } | null {
  if (!rawLabel) return null;
  // Normalize: lowercase + trim + collapse spaces + remove trailing colon
  const normalized = rawLabel
    .toLowerCase()
    .trim()
    .replace(/[:\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^:\s*/, "");

  if (METRIC_ALIASES[normalized]) return METRIC_ALIASES[normalized];

  // Try fuzzy: remove parentheses content
  const stripped = normalized.replace(/\([^)]*\)/g, "").trim();
  if (METRIC_ALIASES[stripped]) return METRIC_ALIASES[stripped];

  return null;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Fetch CSV dari URL Google Sheet dan parse ke array of rows.
 */
export async function fetchSheetCSV(url: string): Promise<string[][]> {
  // Pastikan URL menghasilkan CSV
  const csvUrl = url.includes("output=csv") ? url : `${url}${url.includes("?") ? "&" : "?"}output=csv`;

  const res = await fetch(csvUrl, {
    redirect: "follow",
    headers: { Accept: "text/csv, application/csv, */*" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Gagal fetch sheet: HTTP ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (!text || text.length < 10) {
    throw new Error("Sheet kosong atau tidak terbaca");
  }

  // Parse CSV (auto-detect delimiter, support quoted multi-line cells)
  const records = parse(text, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records as string[][];
}

/**
 * Parse satu row sheet ke struktur ParsedRow.
 */
export function parseRow(cells: string[], rowIndex: number): ParsedRow {
  const warnings: string[] = [];

  // Header row detected (No | Input Date | Client | PIC | Divisi ...)
  const first = (cells[0] || "").toString().toLowerCase().trim();
  if (first === "no" || first === "no." || first === "number") {
    return {
      rowIndex,
      date: null,
      clientName: "",
      picName: "",
      division: "",
      platform: "unknown",
      detectedObjective: "",
      periodStart: null,
      periodEnd: null,
      periodRawText: "",
      metrics: [],
      analysisText: "",
      status: "",
      rawPerformanceText: "",
      parseWarnings: ["header-row"],
    };
  }

  // Asumsi struktur kolom:
  // 0: No
  // 1: Input Date
  // 2: Client
  // 3: PIC
  // 4: Divisi
  // 5: Maintain Performance / Metrics (multi-line)
  // 6: Result Performance / Analisa
  // 7: Status (Send / Draft / Reviewed)
  // 8+: kolom tambahan (jarang dipakai)

  const dateRaw = cells[1] || "";
  const clientName = (cells[2] || "").trim();
  const picName = (cells[3] || "").trim();
  const division = (cells[4] || "").trim();
  const performanceText = cells[5] || "";
  const analysisText = cells[6] || "";
  const statusRaw = (cells[7] || "").trim();

  const date = parseDate(dateRaw);

  // Extract period & platform dari performance text (kolom 5)
  const periodInfo = extractPeriod(performanceText);
  const platform = detectPlatform(performanceText);

  // Parse metrics dari performanceText (line-by-line)
  const metrics: ParsedMetric[] = [];
  const lines = performanceText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip baris header seperti "Meta ADS - 19 s/d 25/1/26"
    if (/^(meta|google|tiktok)\s+ads/i.test(trimmed)) continue;
    if (/^(value|growth|kesimpulan)\s*[:=]/i.test(trimmed)) continue;

    // Skip section text yang bukan metric (Analisa, Catatan, Note, Solusi, dll)
    // — label ini berisi narrative text, bukan angka metric
    if (/^(analisa|analisis|note|catatan|solusi|solving|komentar|remarks|conclusion)\s*[:=]/i.test(trimmed)) {
      // Tapi simpan ke analysisText sebagai fallback kalau analysisText kolom kosong
      continue;
    }

    // Pattern: "Label : Value" atau "Label: Value"
    // Value bisa: "Rp1.234.567", "1,35%", "82", "7.64%"
    const m = trimmed.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;

    const rawLabel = m[1].trim();
    const rawValue = m[2].trim();

    // Skip kalau bukan metric (mis. "Meta ADS - 19 s/d 25/1/26")
    if (/s\/d|sampai/.test(rawValue)) continue;
    if (/^(\d{1,2})\s*s\/d/.test(rawValue)) continue;

    // Cek apakah value mengandung angka — kalau tidak, skip (bukan metric)
    // Tambahan: value tidak boleh mengandung huruf setelah angka lebih dari 3 char
    // (mencegah narrative text masuk sebagai metric)
    if (!/\d/.test(rawValue)) continue;

    // Heuristic: kalau value mengandung > 5 kata, kemungkinan narrative text
    const wordCount = rawValue.split(/\s+/).length;
    if (wordCount > 8) continue;

    const mapped = mapMetricLabel(rawLabel);
    const value = normalizeNumber(rawValue);

    if (value === null) continue;

    if (mapped) {
      // Avoid duplicate key — last one wins
      const existingIdx = metrics.findIndex((x) => x.key === mapped.key);
      const entry: ParsedMetric = {
        key: mapped.key,
        rawLabel,
        value,
        unit: mapped.unit,
      };
      if (existingIdx >= 0) {
        metrics[existingIdx] = entry;
      } else {
        metrics.push(entry);
      }
    } else {
      // Unknown metric — simpan dengan key yang sudah dinormalisasi
      const fallbackKey = rawLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50);
      const entry: ParsedMetric = {
        key: fallbackKey || `metric_${metrics.length}`,
        rawLabel,
        value,
        unit: "number",
      };
      const existingIdx = metrics.findIndex((x) => x.key === entry.key);
      if (existingIdx >= 0) metrics[existingIdx] = entry;
      else metrics.push(entry);
      warnings.push(`unknown-metric: "${rawLabel}"`);
    }
  }

  // Detect objective dari metric set
  const detectedObjective = metrics.length > 0 ? detectObjective(metrics, platform) : "";

  // Normalize status — map value dari sheet ke enum DB
  // (DB enum: 'draft' | 'submitted' | 'reviewed')
  const STATUS_MAP: Record<string, string> = {
    send: "submitted",
    sent: "submitted",
    submitted: "submitted",
    submit: "submitted",
    draft: "draft",
    drafts: "draft",
    reviewed: "reviewed",
    review: "reviewed",
    approved: "reviewed",
    done: "reviewed",
    pending: "draft",
  };
  const statusKey = (statusRaw || "").toLowerCase().trim();
  const status = STATUS_MAP[statusKey] || "submitted"; // default submitted

  return {
    rowIndex,
    date,
    clientName,
    picName,
    division,
    platform,
    detectedObjective,
    periodStart: periodInfo.start,
    periodEnd: periodInfo.end,
    periodRawText: periodInfo.raw,
    metrics,
    analysisText,
    status,
    rawPerformanceText: performanceText,
    parseWarnings: warnings,
  };
}

/**
 * Parse semua rows dari CSV string[][]
 */
export function parseAllRows(rows: string[][]): ParseResult {
  const parsed: ParsedRow[] = [];
  const errors: string[] = [];
  let skippedHeader = false;

  rows.forEach((cells, idx) => {
    try {
      const row = parseRow(cells, idx);
      // Skip header & empty rows
      if (row.parseWarnings.includes("header-row")) {
        skippedHeader = true;
        return;
      }
      if (!row.clientName && !row.rawPerformanceText) {
        // Empty row
        return;
      }
      parsed.push(row);
    } catch (err) {
      errors.push(`Row ${idx}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return {
    rows: parsed,
    totalRows: parsed.length,
    skippedHeader,
    errors,
  };
}

// ============================================================================
// UTILS UNTUK UI
// ============================================================================

/**
 * Match client name dari sheet ke daftar client di DB (fuzzy).
 * Returns { id, name, confidence } atau null.
 */
export function matchClientFuzzy(
  sheetName: string,
  dbClients: Array<{ id: string; name: string }>
): { id: string; name: string; confidence: number } | null {
  if (!sheetName) return null;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const target = normalize(sheetName);
  if (!target) return null;

  let best: { id: string; name: string; confidence: number } | null = null;

  for (const c of dbClients) {
    const candidate = normalize(c.name);
    if (!candidate) continue;

    // Exact match (after normalize)
    if (candidate === target) {
      return { id: c.id, name: c.name, confidence: 1 };
    }

    // Substring match
    if (candidate.includes(target) || target.includes(candidate)) {
      const conf = Math.min(candidate.length, target.length) / Math.max(candidate.length, target.length);
      if (!best || conf > best.confidence) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
      continue;
    }

    // Word overlap (Jaccard) — gunakan array untuk hindari Set iteration
    // (TS error TS2802 jika target < es2015)
    const wordsAArr = candidate.split(" ");
    const wordsBArr = target.split(" ");
    const wordsBSet = new Set(wordsBArr);
    const intersection = wordsAArr.filter((w) => wordsBSet.has(w) && w.length > 2).length;
    const union = new Set(wordsAArr.concat(wordsBArr)).size;
    if (intersection > 0 && union > 0) {
      const conf = intersection / union;
      if (conf >= 0.4 && (!best || conf > best.confidence)) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
    }
  }

  return best;
}

/**
 * Match PIC name dari sheet ke daftar profile di DB (fuzzy).
 */
export function matchPicFuzzy(
  sheetName: string,
  dbProfiles: Array<{ id: string; full_name: string }>
): { id: string; full_name: string; confidence: number } | null {
  if (!sheetName) return null;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const target = normalize(sheetName);
  if (!target) return null;

  let best: { id: string; full_name: string; confidence: number } | null = null;

  for (const p of dbProfiles) {
    const candidate = normalize(p.full_name);
    if (!candidate) continue;

    if (candidate === target) return { id: p.id, full_name: p.full_name, confidence: 1 };

    if (candidate.includes(target) || target.includes(candidate)) {
      const conf = Math.min(candidate.length, target.length) / Math.max(candidate.length, target.length);
      if (!best || conf > best.confidence) {
        best = { id: p.id, full_name: p.full_name, confidence: conf };
      }
      continue;
    }

    // Word match (untuk "Yoga" vs "Yoga Pratama")
    const wordsA = candidate.split(" ");
    if (wordsA.some((w) => w === target && w.length > 2)) {
      if (!best || 0.8 > best.confidence) {
        best = { id: p.id, full_name: p.full_name, confidence: 0.8 };
      }
    }
  }

  return best;
}

// ============================================================================
// PERIOD HELPER
// ============================================================================

/**
 * Format Date ke YYYY-MM-DD (untuk DB insert).
 */
export function toDateString(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}