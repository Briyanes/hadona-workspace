// ============================================
// REPORTS METRIC TYPES & HELPERS (shared)
// ============================================
// Diekstrak dari src/app/(dashboard)/reports/page.tsx (BATCH 2 Sesi 2)
// Single source of truth untuk types + metric definitions + alias resolver.
// Dipakai oleh: reports page, share-button, dan komponen reports lainnya.

import { formatIDR, formatCompact } from "@/lib/utils";
import { OBJECTIVE_MAP, type ObjectiveKey } from "@/lib/ad-objectives";

// ─── TYPES ───

export interface ReportMetric {
  id: string;
  weekly_report_id: string;
  metric_type: string;
  value: number | null;
  previous_value: number | null;
  platform?: string | null;
}

export interface Report {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  performance_text: string | null;
  conclusion: string | null;
  action: string | null;
  status: string;
  objective?: string | null;
  created_at: string;
  client?: { name: string };
  pic?: { full_name: string };
  report_metrics?: ReportMetric[];
}

export interface Client {
  id: string;
  name: string;
}

export interface BudgetPacing {
  targetSpend: number;
  actualSpend: number;
  pacingPercent: number;
  remainingBudget: number;
  activeAccountCount: number;
  periodDays: number;
}

export interface PulledMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpr: number;
  cpc: number;
  cpm: number;
  roas: number;
  frequency: number;
}

export interface PlatformBreakdown {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  accountCount: number;
  ctr: number;
  cpr: number;
  roas: number;
}

export type CardMetric = {
  label: string;
  value: string;
  color?: string;
};

// ─── METRIC DEFINITIONS — untuk Advertiser ───

export const METRIC_DEFS: Array<{
  key: string;
  label: string;
  unit: "currency" | "number" | "percent" | "ratio";
  description: string;
  derived?: boolean;
}> = [
  { key: "spend", label: "Total Spend", unit: "currency", description: "Total biaya iklan minggu ini" },
  { key: "impressions", label: "Impressions", unit: "number", description: "Total tayang iklan" },
  { key: "clicks", label: "Clicks (Link)", unit: "number", description: "Total klik link iklan" },
  { key: "ctr", label: "CTR", unit: "percent", description: "Click-Through Rate = clicks/impressions", derived: true },
  { key: "cpc", label: "CPC", unit: "currency", description: "Cost Per Click = spend/clicks", derived: true },
  { key: "cpm", label: "CPM", unit: "currency", description: "Cost Per 1000 Impressions", derived: true },
  { key: "wa_leads", label: "WA Leads", unit: "number", description: "Chat WhatsApp masuk" },
  { key: "conversions", label: "Conversions", unit: "number", description: "Total konversi/pembelian" },
  { key: "cpr", label: "CPR", unit: "currency", description: "Cost Per Result = spend/conversions", derived: true },
  { key: "revenue", label: "Revenue", unit: "currency", description: "Pendapatan dari konversi" },
  { key: "roas", label: "ROAS", unit: "ratio", description: "Return On Ad Spend = revenue/spend", derived: true },
  { key: "link_clicks", label: "Link Clicks", unit: "number", description: "Klik ke landing page" },
  { key: "frequency", label: "Frequency", unit: "ratio", description: "Rata-rata iklan dilihat per orang" },
];

// ─── METRIC ALIASES — bridge sheet parser keys ↔ UI keys ───
// Sheet parser (src/lib/sheet-parser.ts) menyimpan metric_type dengan key
// standard Meta API: "amount_spent", "cost_per_result", "messaging_conversations_started", dll.
// Tapi UI frontend pakai key pendek: "spend", "cpr", "conversions", dll.
// Tanpa alias resolver, semua card di reports page akan tampil "-".
// Alias ini di-lookup berurutan (prioritas pertama → terakhir).
export const METRIC_ALIASES: Record<string, string[]> = {
  spend: ["spend", "amount_spent"],
  impressions: ["impressions"],
  clicks: ["clicks", "link_clicks"],
  ctr: ["ctr", "ctr_all"],
  cpc: ["cpc", "cpc_all", "cpc_link", "cost_per_click"],
  cpm: ["cpm", "cost_per_1k_reached"],
  conversions: ["conversions", "purchases", "messaging_conversations_started"],
  cpr: ["cpr", "cost_per_result", "cost_per_purchase", "cost_per_message"],
  revenue: ["revenue", "purchase_value"],
  roas: ["roas", "purchase_roas"],
  frequency: ["frequency", "freq"],
  wa_leads: ["wa_leads", "messaging_conversations_started"],
  link_clicks: ["link_clicks"],
  instagram_follows: ["instagram_follows", "ig_follows", "new_followers"],
};

/**
 * Cari nilai metric di array dengan multiple alias.
 * Return value pertama yang ketemu (non-null & valid).
 * Contoh: getMetricByAliases(metrics, "spend", "amount_spent") → 1093910
 */
export function getMetricByAliases(metrics: ReportMetric[], ...aliases: string[]): number {
  for (const alias of aliases) {
    const m = metrics.find((x) => x.metric_type === alias);
    if (m && m.value !== null && m.value !== undefined && !isNaN(m.value as number)) {
      return m.value as number;
    }
  }
  return 0;
}

/**
 * Versi helper yang ambil alias dari METRIC_ALIASES map (lebih ringkas).
 * Contoh: getMetric(metrics, "spend") → otomatis cek "spend" + "amount_spent"
 */
export function getMetric(metrics: ReportMetric[], key: string): number {
  const aliases = METRIC_ALIASES[key] || [key];
  return getMetricByAliases(metrics, ...aliases);
}

// ─── OBJECTIVE-AWARE CARD METRICS ───
// Solve bug "ROAS selalu -" untuk client CTWA: kalau objective CTWA,
// jangan paksa tampilkan ROAS (memang tidak relevan). Tampilkan metric
// yang relevan: Messaging Started, Cost/Msg, OC→WA ratio.
//
// Logic:
// 1. Lookup OBJECTIVE_MAP[objective] → dapat primaryMetrics.
// 2. Spend selalu di slot pertama.
// 3. Ambil 3 primary metric lain (atau fallback kalau kosong).
// 4. Format value sesuai unit (currency / percent / ratio / number).

export const METRIC_CARD_LABEL: Record<string, string> = {
  amount_spent: "SPEND",
  spend: "SPEND",
  purchase_roas: "ROAS",
  roas: "ROAS",
  purchases: "PURCHASES",
  conversions: "CONV",
  cost_per_purchase: "COST/PUR",
  cost_per_result: "CPR",
  cpr: "CPR",
  aov: "AOV",
  purchase_value: "REVENUE",
  revenue: "REVENUE",
  messaging_conversations_started: "MSGS",
  cost_per_message: "COST/MSG",
  oc_to_wa_ratio: "OC→WA",
  ctr_all: "CTR",
  ctr: "CTR",
  ctr_link: "CTR",
  cpc_all: "CPC",
  cpc_link: "CPC",
  cpc: "CPC",
  cpm: "CPM",
  impressions: "IMPR",
  reach: "REACH",
  clicks_all: "CLICKS",
  link_clicks: "LINKS",
  frequency: "FREQ",
  landing_page_views: "LPV",
  cost_per_lpv: "COST/LPV",
  instagram_follows: "FOLLOWS",
  video_views: "VIDS",
  vtr: "VTR",
};

export function getObjectiveCardMetrics(
  objective: string | null | undefined,
  metrics: ReportMetric[]
): CardMetric[] {
  const obj = objective ? OBJECTIVE_MAP[objective] : undefined;
  const FALLBACK_KEYS = ["spend", "conversions", "ctr", "roas"];

  let selectedKeys: string[];
  if (obj) {
    const primary = obj.primaryMetrics.filter((m) => m !== "amount_spent");
    selectedKeys = ["amount_spent", ...primary].slice(0, 4);
    if (selectedKeys.length < 4) {
      for (const m of obj.secondaryMetrics) {
        if (selectedKeys.length >= 4) break;
        if (!selectedKeys.includes(m)) selectedKeys.push(m);
      }
    }
  } else {
    selectedKeys = FALLBACK_KEYS;
  }

  return selectedKeys.slice(0, 4).map((key) => {
    const value = getMetric(metrics, key);
    const label = METRIC_CARD_LABEL[key] || key.toUpperCase().slice(0, 8);

    let formatted = "-";
    let color: string | undefined;

    if (value > 0) {
      if (key === "amount_spent" || key === "spend" || key.includes("cost_per_") ||
          key === "aov" || key === "cpc" || key === "cpm" || key === "cpr" ||
          key === "purchase_value" || key === "revenue" || key === "cpv" || key === "cpi") {
        formatted = formatIDR(value);
      } else if (key.includes("ctr") || key.includes("ratio") || key.includes("rate") ||
                 key === "vtr" || key === "engagement_rate" || key === "impression_share") {
        formatted = `${value.toFixed(2)}%`;
      } else if (key === "purchase_roas" || key === "roas") {
        formatted = `${value.toFixed(2)}x`;
        color = value >= 3 ? "text-success" : value >= 1 ? "text-warning" : "text-danger";
      } else if (key === "frequency" || key === "quality_score") {
        formatted = value.toFixed(2);
      } else {
        formatted = formatCompact(value);
      }
    }

    return { label, value: formatted, color };
  });
}

// ─── FORMAT HELPERS ───

export function formatMetric(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  switch (unit) {
    case "currency":
      return formatIDR(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "number":
      return formatCompact(value);
    default:
      return String(value);
  }
}

export function calcWowDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ─── FORM FACTORY ───

export function createEmptyReportForm() {
  return {
    client_id: "",
    period_start: "",
    period_end: "",
    summary: "",
    performance_text: "",
    conclusion: "",
    action: "",
    status: "draft" as string,
    objective: "META_CTWA" as ObjectiveKey, // default objective
    // Structured metrics (key -> value)
    metrics: {} as Record<string, number | "">,
  };
}