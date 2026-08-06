"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  X,
  Pencil,
  Trash2,
  AlertCircle,
  Search,
  Clock,
  CheckCircle,
  Send,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Sparkles,
  BarChart3,
  Copy,
  Mail,
  Eye,
  ChevronDown,
  LayoutGrid,
  Table2,
  CheckSquare,
  Layers,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatDate, formatIDR, formatCompact, cn, extractError } from "@/lib/utils";
import { CompareView } from "@/components/reports/compare-view";
import { ShareButton } from "@/components/reports/share-button";
import { GoalTracker } from "@/components/reports/goal-tracker";
import { EmailScheduleManager } from "@/components/reports/email-schedule-manager";
import { CreativePerformanceTracker } from "@/components/reports/creative-performance-tracker";
import { ObjectiveSelector } from "@/components/reports/objective-selector";
import { ObjectiveKPIBar } from "@/components/reports/kpi-bar";
import { ImportSheetModal } from "@/components/reports/import-sheet-modal";
import { SheetPreviewModal } from "@/components/reports/sheet-preview-modal";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { OBJECTIVE_MAP, type ObjectiveKey } from "@/lib/ad-objectives";
import { generateReportText } from "@/lib/report-generator";
import { FileSpreadsheet } from "lucide-react";

// ============================================
// TYPES
// ============================================

interface ReportMetric {
  id: string;
  weekly_report_id: string;
  metric_type: string;
  value: number | null;
  previous_value: number | null;
  platform?: string | null;
}

interface Report {
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

interface Client {
  id: string;
  name: string;
}

interface BudgetPacing {
  targetSpend: number;
  actualSpend: number;
  pacingPercent: number;
  remainingBudget: number;
  activeAccountCount: number;
  periodDays: number;
}

interface PulledMetrics {
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

interface PlatformBreakdown {
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

// ============================================
// METRIC DEFINITIONS — untuk Advertiser
// ============================================

const METRIC_DEFS: Array<{
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

// ============================================
// METRIC ALIASES — bridge sheet parser keys ↔ UI keys
// ============================================
// Sheet parser (src/lib/sheet-parser.ts) menyimpan metric_type dengan key
// standard Meta API: "amount_spent", "cost_per_result", "messaging_conversations_started", dll.
// Tapi UI frontend pakai key pendek: "spend", "cpr", "conversions", dll.
// Tanpa alias resolver, semua card di reports page akan tampil "-".
// Alias ini di-lookup berurutan (prioritas pertama → terakhir).
const METRIC_ALIASES: Record<string, string[]> = {
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
function getMetricByAliases(metrics: ReportMetric[], ...aliases: string[]): number {
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
function getMetric(metrics: ReportMetric[], key: string): number {
  const aliases = METRIC_ALIASES[key] || [key];
  return getMetricByAliases(metrics, ...aliases);
}

// ============================================
// OBJECTIVE-AWARE CARD METRICS
// ============================================
// Solve bug "ROAS selalu -" untuk client CTWA: kalau objective CTWA,
// jangan paksa tampilkan ROAS (memang tidak relevan). Tampilkan metric
// yang relevan: Messaging Started, Cost/Msg, OC→WA ratio.
//
// Logic:
// 1. Lookup OBJECTIVE_MAP[objective] → dapat primaryMetrics.
// 2. Spend selalu di slot pertama.
// 3. Ambil 3 primary metric lain (atau fallback kalau kosong).
// 4. Format value sesuai unit (currency / percent / ratio / number).

type CardMetric = {
  label: string;
  value: string;
  color?: string;
};

const METRIC_CARD_LABEL: Record<string, string> = {
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

function getObjectiveCardMetrics(
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

// ============================================
// HELPERS
// ============================================

function formatMetric(value: number | null | undefined, unit: string): string {
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

function calcWowDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function createEmptyForm() {
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

// ============================================
// MAIN COMPONENT
// ============================================

export default function ReportsPage() {
  const supabase = createClient();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  // 🆕 Sprint 1: Filter parity dengan clients page
  const [filterPIC, setFilterPIC] = useState("all");
  const [filterObjective, setFilterObjective] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(createEmptyForm());

  // Auto-pull state
  const [pulling, setPulling] = useState(false);
  const [pulledData, setPulledData] = useState<{
    metrics: PulledMetrics;
    platformBreakdown: PlatformBreakdown[];
    hasData: boolean;
    accountCount: number;
    budgetPacing: BudgetPacing | null;
  } | null>(null);

  // WoW previous metrics
  const [previousMetrics, setPreviousMetrics] = useState<Record<string, number>>({});
  const [loadingPrevious, setLoadingPrevious] = useState(false);

  // Detail view modal
  const [detailReport, setDetailReport] = useState<Report | null>(null);

  // Chart data (history per client)
  const [chartData, setChartData] = useState<
    Array<{ period: string; spend: number; conversions: number; revenue: number }>
  >([]);

  // Active tab: "list" | "compare" | "automation"
  const [activeTab, setActiveTab] = useState<"list" | "compare" | "automation">("list");

  // Compare view state
  const [compareClient, setCompareClient] = useState<string>("all");

  // AI Generator state
  const [generating, setGenerating] = useState(false);

  // Bulk Actions state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Auto-show bulk bar ketika ada selection (selama di bulk mode)
  const showBulkBar = bulkMode && selectedIds.size > 0;

  // 🆕 Pagination state (Tier 1 — Load More)
  // Default tampilkan 12 cards. Naikkan +12 setiap klik "Load More".
  // Reset ke 12 otomatis saat filter/search berubah (lihat useEffect di bawah).
  // Performance: hindari render 285 cards sekaligus setelah sync Google Sheet.
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Import Sheet Modal state
  const [showImportModal, setShowImportModal] = useState(false);

  // Sheet Preview Modal state (lihat semua sheet tabs — read-only)
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  // 🔒 P0-1 Security: Hapus hardcoded sheet URL dari client bundle.
  // Sebelumnya URL spreadsheet terekspos di Production JS bundle (DevTools > Sources).
  // Sekarang modals dikirim empty string; mereka akan GET /api/reports/sheets
  // yang membaca DEFAULT_SHEET_URL dari server-only env.
  const DEFAULT_SHEET_URL = "";

  // Sync Now state (auto-sync multi-tab dari published Google Sheet)
  const [syncing, setSyncing] = useState(false);
  const [showSyncResult, setShowSyncResult] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    summary: {
      totalRows: number;
      imported: number;
      updated: number;
      skipped: number;
      errors: number;
      durationSec: number;
      sheets?: Array<{ name: string; gid: string; raw: number; parsed: number; imported: number }>;
      skippedBreakdown?: {
        noMetrics: number;
        noClient: number;
        noPeriod: number;
        dedup: number;
        unmatchedClient: number;
        samples?: {
          noMetrics: string[];
          noClient: string[];
          noPeriod: string[];
          dedup: string[];
          unmatchedClient: string[];
        };
      };
    };
    unmatchedClients: string[];
    unmatchedPics: string[];
    errors_detail: string[];
  } | null>(null);

  // ─── Sync Now: jalankan auto-sync dari published Google Sheet (multi-tab) ───
  async function handleSyncNow() {
    if (!confirm(
      "Sync semua weekly reports dari Google Sheet?\n\n" +
      "Sumber: 7 sheet tabs (Januari '26 – Juli '26, ~285 rows)\n" +
      "Mode: Idempotent (tidak duplikasi, update kalau sudah ada)\n\n" +
      "Proses butuh ~10-30 detik. Lanjutkan?"
    )) return;

    setSyncing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      // Cache-busting: tambahkan timestamp untuk hindari cache di CDN/proxy/browser.
      // POST seharusnya tidak di-cache, tapi praktik defensif penting karena
      // kami mendapati pesan error lama muncul setelah deploy baru.
      const syncUrl = `/api/reports/sync?_t=${Date.now()}`;
      const res = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
        cache: "no-store",
        body: JSON.stringify({}), // pakai default URL dari env
      });

      // ─── Robust response handling ───
      // Cek content-type sebelum parse JSON. Beberapa kasus response bukan JSON:
      //  - Vercel build masih running (static placeholder)
      //  - Middleware redirect (HTML)
      //  - Function timeout (Vercel error page)
      //  - Session expired → login page HTML
      const contentType = res.headers.get("content-type") || "";
      const rawText = await res.text();

      if (!contentType.includes("application/json") || rawText.trim().startsWith("<")) {
        // Response HTML — bukan dari API route kita
        if (rawText.includes("Sign in") || rawText.includes("login")) {
          throw new Error("Session expired. Silakan refresh halaman & login ulang.");
        }
        if (res.status === 404) {
          throw new Error("Endpoint tidak ditemukan (404). Vercel mungkin masih build commit terbaru. Tunggu 2-3 menit lalu coba lagi.");
        }
        if (res.status >= 500) {
          throw new Error(`Server error ${res.status}. Vercel Function mungkin timeout atau crash. Coba lagi dalam 1 menit.`);
        }
        throw new Error(`Response tidak valid (HTTP ${res.status}, ${contentType || "no content-type"}). Kemungkinan Vercel masih build. Tunggu 2-3 menit lalu hard refresh (Cmd+Shift+R).`);
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Gagal parse JSON response. Raw: ${rawText.slice(0, 200)}`);
      }

      if (!res.ok) {
        // Pesan error sekarang include role user (lihat /api/reports/sync route)
        // sehingga lebih informatif untuk debugging
        const roleInfo = data.debug?.userRole
          ? ` (role Anda: "${data.debug.userRole}")`
          : "";
        throw new Error((data.error || "Gagal sync") + roleInfo);
      }

      setSyncResult({
        summary: data.summary,
        unmatchedClients: data.unmatchedClients || [],
        unmatchedPics: data.unmatchedPics || [],
        errors_detail: data.errors_detail || [],
      });
      setShowSyncResult(true);

      toast.success(
        `✅ Sync selesai: ${data.summary.imported} baru, ${data.summary.updated} update, ${data.summary.skipped} skip dalam ${data.summary.durationSec}s`,
        { duration: 6000 }
      );

      // Reload reports
      loadReports();
    } catch (err) {
      toast.error("Gagal sync: " + extractError(err));
    } finally {
      setSyncing(false);
    }
  }

  const loadReports = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*, client:clients(name), pic:profiles(full_name), report_metrics(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReports((data as unknown as Report[]) || []);
    } catch (err) {
      const msg = extractError(err);
      setError("Gagal memuat laporan: " + msg);
      toast.error("Gagal memuat data laporan");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (error) {
      toast.error("Gagal memuat daftar client");
      return;
    }
    setClients((data as unknown as Client[]) || []);
  }, [supabase]);

  useEffect(() => {
    loadReports();
    loadClients();
  }, [loadReports, loadClients]);

  // ─── Auto-pull ads data ───
  async function handlePullAds() {
    if (!form.client_id || !form.period_start || !form.period_end) {
      toast.error("Pilih client & isi periode dulu sebelum pull data");
      return;
    }
    if (new Date(form.period_start) > new Date(form.period_end)) {
      toast.error("Periode mulai harus sebelum periode selesai");
      return;
    }

    setPulling(true);
    setPulledData(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "pull-ads",
          clientId: form.client_id,
          periodStart: form.period_start,
          periodEnd: form.period_end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal pull data");

      if (!data.hasData) {
        toast.info(data.message || "Tidak ada data ads untuk periode ini");
        return;
      }

      // Isi form metrics dengan data yang di-pull
      const newMetrics = { ...form.metrics };
      newMetrics.spend = data.metrics.spend || "";
      newMetrics.impressions = data.metrics.impressions || "";
      newMetrics.clicks = data.metrics.clicks || "";
      newMetrics.ctr = data.metrics.ctr || "";
      newMetrics.cpc = data.metrics.cpc || "";
      newMetrics.cpm = data.metrics.cpm || "";
      newMetrics.conversions = data.metrics.conversions || "";
      newMetrics.cpr = data.metrics.cpr || "";
      newMetrics.revenue = data.metrics.revenue || "";
      newMetrics.roas = data.metrics.roas || "";

      setForm({ ...form, metrics: newMetrics });
      setPulledData({
        metrics: data.metrics,
        platformBreakdown: data.platformBreakdown || [],
        hasData: true,
        accountCount: data.accountCount || 0,
        budgetPacing: data.budgetPacing || null,
      });

      toast.success(
        `✅ Data ads ter-pull! ${data.accountCount} akun • ${data.logCount} log • Spend: ${formatIDR(data.metrics.spend)}`,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error("Gagal pull ads data: " + extractError(err));
    } finally {
      setPulling(false);
    }
  }

  // ─── Load previous week untuk WoW ───
  async function loadPreviousWeek(clientId: string, periodStart: string) {
    if (!clientId || !periodStart) return;
    setLoadingPrevious(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "get-previous",
          clientId,
          periodStart,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal ambil data sebelumnya");

      if (data.hasPrevious) {
        setPreviousMetrics(data.previousMetrics || {});
        toast.info(`WoW: Membandingkan dengan report ${formatDate(data.previousReport.period_start)} - ${formatDate(data.previousReport.period_end)}`);
      } else {
        setPreviousMetrics({});
      }
    } catch {
      setPreviousMetrics({});
    } finally {
      setLoadingPrevious(false);
    }
  }

  // ─── Trigger load previous saat client/period berubah ───
  useEffect(() => {
    if (showModal && form.client_id && form.period_start) {
      loadPreviousWeek(form.client_id, form.period_start);
    } else {
      setPreviousMetrics({});
      setPulledData(null);
    }
  }, [form.client_id, form.period_start, showModal]);

  function openEdit(report: Report) {
    const metricsMap: Record<string, number | ""> = {};
    (report.report_metrics || []).forEach((m) => {
      // Aggregate per metric_type (ambil value total)
      const existing = typeof metricsMap[m.metric_type] === "number" ? (metricsMap[m.metric_type] as number) : 0;
      metricsMap[m.metric_type] = existing + (m.value || 0);
    });

    setEditingId(report.id);
    setForm({
      client_id: report.client_id,
      period_start: report.period_start,
      period_end: report.period_end,
      summary: report.summary || "",
      performance_text: report.performance_text || "",
      conclusion: report.conclusion || "",
      action: report.action || "",
      status: report.status,
      objective: (report as { objective?: string }).objective || "META_CTWA",
      metrics: metricsMap,
    });
    setShowModal(true);
  }

  function openCreate() {
    setEditingId(null);
    setForm(createEmptyForm());
    setPulledData(null);
    setPreviousMetrics({});
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setPulledData(null);
    setPreviousMetrics({});
  }

  // ─── Escape key + body scroll lock untuk modal ───
  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  async function handleDelete(id: string) {
    if (!confirm("Hapus laporan ini? Tindakan tidak dapat dibatalkan.")) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "delete", reportId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus report");
      toast.success("Laporan dihapus");
      loadReports();
    } catch (err) {
      toast.error("Gagal hapus: " + extractError(err));
    }
  }

  // ════════════════════════════════════════════
  // 🆕 BULK ACTIONS — Multi-select operations
  // ════════════════════════════════════════════

  // Select/deselect semua reports yang terlihat (visible = sudah ter-render)
  function toggleSelectAll() {
    if (selectedIds.size === visibleReports.length && visibleReports.length > 0) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all visible
      setSelectedIds(new Set(visibleReports.map((r) => r.id)));
    }
  }

  // Bulk delete dengan konfirmasi yang menampilkan count + nama client
  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const selectedReports = reports.filter((r) => selectedIds.has(r.id));
    const clientNames = selectedReports
      .map((r) => r.client?.name || "Unknown")
      .slice(0, 5)
      .join(", ");
    const moreText = selectedReports.length > 5 ? ` dan ${selectedReports.length - 5} lainnya` : "";

    if (!confirm(
      `⚠️ Hapus ${ids.length} report?\n\n` +
      `Client: ${clientNames}${moreText}\n\n` +
      `Tindakan ini TIDAK DAPAT DIBATALKAN.`
    )) return;

    setBulkProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "bulk-delete", reportIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal bulk delete");

      toast.success(`✅ ${data.deleted} report berhasil dihapus`);
      setSelectedIds(new Set());
      setBulkMode(false);
      loadReports();
    } catch (err) {
      toast.error("Gagal bulk delete: " + extractError(err));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Bulk update status (draft → submitted → reviewed)
  async function handleBulkUpdateStatus(newStatus: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !newStatus) return;

    setBulkProcessing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "bulk-update-status", reportIds: ids, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal bulk update status");

      toast.success(`✅ ${data.updated} report diupdate ke "${newStatus}"`);
      setBulkStatus("");
      setSelectedIds(new Set());
      setBulkMode(false);
      loadReports();
    } catch (err) {
      toast.error("Gagal bulk update status: " + extractError(err));
    } finally {
      setBulkProcessing(false);
    }
  }

  // Bulk export — hanya reports yang dipilih
  function handleBulkExport() {
    const selectedReports = reports.filter((r) => selectedIds.has(r.id));
    if (selectedReports.length === 0) {
      toast.error("Tidak ada report dipilih");
      return;
    }

    const headers = [
      "Client",
      "Periode Start",
      "Periode End",
      "Status",
      "PIC",
      "Spend",
      "Impressions",
      "Clicks",
      "CTR (%)",
      "Conversions",
      "CPR",
      "Revenue",
      "ROAS",
      "Summary",
      "Conclusion",
      "Action",
    ];

    const rows = selectedReports.map((r) => {
      const metrics = r.report_metrics || [];
      const getMetric = (type: string) => {
        const aliases = METRIC_ALIASES[type] || [type];
        if (type === "conversions") {
          for (const alias of aliases) {
            const total = metrics.filter((x) => x.metric_type === alias).reduce((s, x) => s + (x.value || 0), 0);
            if (total > 0) return total;
          }
          return 0;
        }
        return metrics
          .filter((x) => aliases.includes(x.metric_type))
          .reduce((s, x) => s + (x.value || 0), 0);
      };

      const stringCols = [
        `"${r.client?.name || ""}"`,
        `"${r.period_start}"`,
        `"${r.period_end}"`,
        `"${r.status}"`,
        `"${r.pic?.full_name || ""}"`,
      ];
      const numCols = [
        Number(getMetric("spend").toFixed(2)),
        getMetric("impressions"),
        getMetric("clicks"),
        Number(getMetric("ctr").toFixed(2)),
        getMetric("conversions"),
        Number(getMetric("cpr").toFixed(2)),
        Number(getMetric("revenue").toFixed(2)),
        Number(getMetric("roas").toFixed(2)),
      ];
      const textCols = [
        `"${(r.summary || "").replace(/"/g, '""')}"`,
        `"${(r.conclusion || "").replace(/"/g, '""')}"`,
        `"${(r.action || "").replace(/"/g, '""')}"`,
      ];

      return [...stringCols, ...numCols, ...textCols];
    });

    const csv = [headers.map((h) => `"${h}"`), ...rows]
      .map((r) => r.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reports-selected-${selectedReports.length}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(`✅ ${selectedReports.length} report diexport ke CSV`);
  }

  // ─── Clone report (duplicate untuk periode baru) ───
  async function handleClone(report: Report) {
    // Hitung periode minggu depan (period_end + 1 hari → +7 hari)
    const prevEnd = new Date(report.period_end);
    const newStart = new Date(prevEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + 6);

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const newPeriodStart = fmt(newStart);
    const newPeriodEnd = fmt(newEnd);

    if (!confirm(`Clone report ini untuk periode ${formatDate(newPeriodStart)} - ${formatDate(newPeriodEnd)}?`)) return;

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "clone",
          reportId: report.id,
          newPeriodStart,
          newPeriodEnd,
          userId: userData.user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal clone report");
      toast.success(`✅ Report di-clone untuk periode ${formatDate(newPeriodStart)}`);
      loadReports();
    } catch (err) {
      toast.error("Gagal clone: " + extractError(err));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) {
      toast.error("Client wajib dipilih");
      return;
    }
    if (!form.period_start || !form.period_end) {
      toast.error("Periode laporan wajib diisi");
      return;
    }
    // Bug fix B4: date validation
    if (new Date(form.period_start) > new Date(form.period_end)) {
      toast.error("Periode mulai harus sebelum periode selesai");
      return;
    }

    // Bug fix B5: overlap check
    const overlap = reports.find(
      (r) =>
        r.client_id === form.client_id &&
        r.id !== editingId &&
        new Date(form.period_start) <= new Date(r.period_end) &&
        new Date(form.period_end) >= new Date(r.period_start)
    );
    if (overlap) {
      if (!confirm(`Periode tumpang tindih dengan report ${formatDate(overlap.period_start)} - ${formatDate(overlap.period_end)}. Lanjutkan simpan?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        period_start: form.period_start,
        period_end: form.period_end,
        summary: form.summary.trim() || null,
        performance_text: form.performance_text.trim() || null,
        conclusion: form.conclusion.trim() || null,
        action: form.action.trim() || null,
        status: form.status,
        objective: form.objective,
      };

      let savedReportId = editingId;

      if (editingId) {
        const { error } = await supabase.from("weekly_reports").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("Laporan berhasil diupdate!");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data: newReport, error } = await supabase
          .from("weekly_reports")
          .insert({
            ...payload,
            pic_id: userData.user?.id,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        savedReportId = (newReport as { id?: string } | null)?.id ?? null;
        toast.success("Laporan berhasil dibuat!");
      }

      // Save structured metrics via API
      if (savedReportId) {
        const metricsArray = Object.entries(form.metrics)
          .filter(([_, v]) => v !== "" && v !== null && !isNaN(Number(v)))
          .map(([key, v]) => {
            const prevVal = previousMetrics[key] || null;
            return {
              metric_type: key,
              value: Number(v),
              previous_value: prevVal,
            };
          });

        if (metricsArray.length > 0) {
          const { data: session } = await supabase.auth.getSession();
          const res = await fetch("/api/reports", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.session?.access_token}`,
            },
            body: JSON.stringify({
              action: "save-metrics",
              reportId: savedReportId,
              metrics: metricsArray,
            }),
          });
          const metricsRes = await res.json();
          if (!res.ok) throw new Error(metricsRes.error || "Gagal simpan metrics");
        }
      }

      closeModal();
      loadReports();
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  // ─── Load chart data saat detail report dibuka ───
  useEffect(() => {
    if (!detailReport) {
      setChartData([]);
      return;
    }
    // Ambil semua report untuk client yang sama, urutkan periode
    const clientReports = reports
      .filter((r) => r.client_id === detailReport.client_id)
      .sort((a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime())
      .slice(-8); // last 8 weeks

    const data = clientReports.map((r) => {
      const metrics = r.report_metrics || [];
      // 🆕 Pakai alias resolver (sheet parser pakai "amount_spent", bukan "spend")
      const spendAliases = METRIC_ALIASES.spend;
      const spend = metrics
        .filter((m) => spendAliases.includes(m.metric_type))
        .reduce((s, m) => s + (m.value || 0), 0);
      const conversionsAliases = METRIC_ALIASES.conversions;
      // Hindari double-count: ambil alias pertama yang ada value
      const convVal = (() => {
        for (const alias of conversionsAliases) {
          const total = metrics.filter((m) => m.metric_type === alias).reduce((s, m) => s + (m.value || 0), 0);
          if (total > 0) return total;
        }
        return 0;
      })();
      const revenueAliases = METRIC_ALIASES.revenue;
      const revenue = metrics
        .filter((m) => revenueAliases.includes(m.metric_type))
        .reduce((s, m) => s + (m.value || 0), 0);

      return {
        period: `${formatDate(r.period_start, { day: "numeric", month: "short" })}`,
        spend,
        conversions: convVal,
        revenue,
      };
    });
    setChartData(data);
  }, [detailReport, reports]);

  // ─── P1: AI Smart Summary Generator ───
  function handleGenerateText() {
    const hasMetrics = Object.values(form.metrics).some((v) => v !== "" && v !== null && Number(v) > 0);
    if (!hasMetrics) {
      toast.error("Isi atau pull metrik dulu sebelum generate naratif");
      return;
    }

    setGenerating(true);
    try {
      const clientName = clients.find((c) => c.id === form.client_id)?.name || "Client";

      const metricsData = {
        spend: Number(form.metrics.spend) || undefined,
        impressions: Number(form.metrics.impressions) || undefined,
        clicks: Number(form.metrics.clicks) || undefined,
        ctr: Number(form.metrics.ctr) || undefined,
        cpc: Number(form.metrics.cpc) || undefined,
        cpm: Number(form.metrics.cpm) || undefined,
        conversions: Number(form.metrics.conversions) || undefined,
        cpr: Number(form.metrics.cpr) || undefined,
        revenue: Number(form.metrics.revenue) || undefined,
        roas: Number(form.metrics.roas) || undefined,
        frequency: Number(form.metrics.frequency) || undefined,
        wa_leads: Number(form.metrics.wa_leads) || undefined,
        link_clicks: Number(form.metrics.link_clicks) || undefined,
      };

      const generated = generateReportText(metricsData, previousMetrics, clientName);

      setForm((prev) => ({
        ...prev,
        summary: generated.summary,
        performance_text: generated.performance_text,
        conclusion: generated.conclusion,
        action: generated.action,
      }));

      toast.success("✨ Naratif berhasil di-generate! Review & edit sesuai kebutuhan.", { duration: 4000 });
    } catch (err) {
      toast.error("Gagal generate: " + extractError(err));
    } finally {
      setGenerating(false);
    }
  }

  // 🆕 Reset visibleCount ke 12 setiap kali filter/search berubah.
  // Sekarang include filterPIC & filterObjective juga (Sprint 1).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, statusFilter, clientFilter, filterPIC, filterObjective]);

  // ─── Filter logic (B3 fix: include conclusion & action) ───
  // 🆕 Sprint 1: tambah filterPIC & filterObjective (parity dengan clients page).
  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      r.client?.name?.toLowerCase().includes(q) ||
      r.summary?.toLowerCase().includes(q) ||
      r.performance_text?.toLowerCase().includes(q) ||
      r.conclusion?.toLowerCase().includes(q) ||
      r.action?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchClient = clientFilter === "all" || r.client_id === clientFilter;
    // 🆕 PIC filter: match by pic.full_name (already joined from profiles)
    const matchPIC =
      filterPIC === "all" ||
      (r.pic?.full_name && r.pic.full_name === filterPIC);
    // 🆕 Objective filter: match by objective field (META_CTWA, META_SALES, dll)
    const matchObjective =
      filterObjective === "all" ||
      r.objective === filterObjective;
    return matchSearch && matchStatus && matchClient && matchPIC && matchObjective;
  });

  // 🆕 Sprint 1.3: Quick Status Chips counters (real-time dari reports data).
  // Pattern sama dengan clients page — chips with counter for 1-klik filter switch.
  const statusCounts = useMemo(() => ({
    all: reports.length,
    draft: reports.filter((r) => r.status === "draft").length,
    submitted: reports.filter((r) => r.status === "submitted").length,
    reviewed: reports.filter((r) => r.status === "reviewed").length,
  }), [reports]);

  // 🆕 Sprint 1.4: Derived list of unique PICs from reports (untuk filter dropdown).
  const uniquePICs = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.pic?.full_name) set.add(r.pic.full_name);
    });
    return Array.from(set).sort();
  }, [reports]);

  // 🆕 Sprint 1.4: Derived list of objectives yang dipakai di reports (untuk filter dropdown).
  // Hanya tampilkan objective yang actually dipakai (lebih relevant dari pada 22 objective).
  const uniqueObjectives = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => {
      if (r.objective) set.add(r.objective);
    });
    // Map ke [id, label] untuk display
    return Array.from(set).sort().map((id) => ({
      id,
      label: OBJECTIVE_MAP[id]?.label || id,
    }));
  }, [reports]);

  // 🆕 Sprint 1.3: Active filter count untuk badge (UX: user tau filter aktif).
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (clientFilter !== "all") count++;
    if (filterPIC !== "all") count++;
    if (filterObjective !== "all") count++;
    if (search.trim()) count++;
    return count;
  }, [statusFilter, clientFilter, filterPIC, filterObjective, search]);

  // 🆕 Sprint 1.3: Reset all filters helper (UX: 1-klik reset).
  const resetAllFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setClientFilter("all");
    setFilterPIC("all");
    setFilterObjective("all");
  }, []);

  // 🆕 Sprint 2: Sortable data via reusable hook (DRY — dipakai juga di clients page).
  // Sort cycle: null → asc → desc → null. Mendukung nested key ("client.name").
  const { sortedData, sortState, toggleSort } = useSortable<Report>({ data: filtered });

  // 🆕 Slice sortedData → hanya render visibleCount pertama (performance).
  // Catatan: gunakan sortedData (bukan filtered) supaya hasil sort konsisten saat Load More.
  // 285 cards × ~40 DOM nodes = ~11.400 nodes (browser recommended <1.500).
  // Dengan slice(0, 12) → 480 nodes. Senyaman non-virtualized list.
  const visibleReports = useMemo(
    () => sortedData.slice(0, visibleCount),
    [sortedData, visibleCount]
  );

  // ════════════════════════════════════════════
  // 🆕 GMAIL-STYLE "Select All Filtered" pattern
  // ════════════════════════════════════════════
  // Saat ada pagination (visibleCount=12, filtered=285), "Pilih Semua" hanya
  // memilih 12 cards yang visible. Banner ini muncul setelah user klik "Pilih Semua"
  // untuk menawarkan pilihan select SEMUA hasil filter (285).
  // Pattern: Gmail → "Select all 12 conversations on this page" + "Select all 285 conversations".
  function selectAllFiltered() {
    if (filtered.length === 0) return;
    setSelectedIds(new Set(filtered.map((r) => r.id)));
    toast.info(`Memilih semua ${filtered.length} report yang sesuai filter`);
  }

  // helper: cek apakah visible sudah ter-select semua (untuk label toggle)
  const allVisibleSelected =
    visibleReports.length > 0 &&
    visibleReports.every((r) => selectedIds.has(r.id));

  // Apakah selectedIds mencakup SEMUA filtered (bukan hanya visible)?
  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((r) => selectedIds.has(r.id));

  // Apakah user perlu ditawari "Select all filtered" (ada lebih banyak filtered dari visible)?
  const showSelectAllFilteredBanner =
    showBulkBar &&
    allVisibleSelected &&            // sudah select semua yang visible
    !allFilteredSelected &&          // tapi belum select semua filtered
    filtered.length > visibleReports.length;

  // ─── Stats ───
  const totalReports = reports.length;
  const draftCount = reports.filter((r) => r.status === "draft").length;
  const submittedCount = reports.filter((r) => r.status === "submitted").length;
  const reviewedCount = reports.filter((r) => r.status === "reviewed").length;

  // Total spend dari semua report yang punya metrics (pakai alias resolver)
  const totalSpend = reports.reduce((sum, r) => {
    const ms = r.report_metrics || [];
    // Sum semua alias spend + amount_spent (hindari double-count)
    const spendAliases = METRIC_ALIASES.spend;
    const spendVal = ms
      .filter((m) => spendAliases.includes(m.metric_type))
      .reduce((s, m) => s + (m.value || 0), 0);
    return sum + spendVal;
  }, 0);

  const totalConversions = reports.reduce((sum, r) => {
    const ms = r.report_metrics || [];
    // Ambil purchases atau messaging (jangan keduanya — avoids double-count)
    const purchases = ms.filter((m) => m.metric_type === "purchases").reduce((s, m) => s + (m.value || 0), 0);
    const messaging = ms.filter((m) => m.metric_type === "messaging_conversations_started").reduce((s, m) => s + (m.value || 0), 0);
    const conversions = ms.filter((m) => m.metric_type === "conversions").reduce((s, m) => s + (m.value || 0), 0);
    // Prioritas: conversions > purchases > messaging
    return sum + (conversions || purchases || messaging);
  }, 0);

  const statCards = [
    { label: "Total Reports", value: totalReports.toString(), icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Draft", value: draftCount.toString(), icon: Clock, color: "text-muted", bg: "bg-surface" },
    { label: "Submitted", value: submittedCount.toString(), icon: Send, color: "text-warning", bg: "bg-warning/10" },
    { label: "Reviewed", value: reviewedCount.toString(), icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Total Spend (All)", value: formatIDR(totalSpend), icon: TrendingUp, color: "text-accent", bg: "bg-accent/10" },
    { label: "Total Conversions", value: formatCompact(totalConversions), icon: BarChart3, color: "text-primary", bg: "bg-primary/10" },
  ];

  const statusColors: Record<string, string> = {
    draft: "bg-surface text-muted",
    submitted: "bg-warning/20 text-warning",
    reviewed: "bg-success/20 text-success",
  };

  const platformColors: Record<string, string> = {
    META: "bg-primary/20 text-primary",
    Google: "bg-warning/20 text-warning",
    TikTok: "bg-gray-900 text-white",
  };

  // ─── Export CSV ───
  function handleExportCSV() {
    if (filtered.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }

    const headers = [
      "Client",
      "Periode Start",
      "Periode End",
      "Status",
      "PIC",
      "Spend",
      "Impressions",
      "Clicks",
      "CTR (%)",
      "Conversions",
      "CPR",
      "Revenue",
      "ROAS",
      "Summary",
      "Conclusion",
      "Action",
    ];

    const rows = filtered.map((r) => {
      const metrics = r.report_metrics || [];
      // 🆕 CSV: pakai alias resolver supaya "spend" tetap ketemu walau DB pakai "amount_spent"
      const getMetric = (type: string) => {
        const aliases = METRIC_ALIASES[type] || [type];
        // Sum semua alias yang ada (tapi untuk conversions hindari double-count)
        if (type === "conversions") {
          for (const alias of aliases) {
            const total = metrics.filter((x) => x.metric_type === alias).reduce((s, x) => s + (x.value || 0), 0);
            if (total > 0) return total;
          }
          return 0;
        }
        return metrics
          .filter((x) => aliases.includes(x.metric_type))
          .reduce((s, x) => s + (x.value || 0), 0);
      };

      // Strings: quote them; Numbers: leave raw so Excel detects as numbers
      const stringCols = [
        `"${r.client?.name || ""}"`,
        `"${r.period_start}"`,
        `"${r.period_end}"`,
        `"${r.status}"`,
        `"${r.pic?.full_name || ""}"`,
      ];
      const numCols = [
        Number(getMetric("spend").toFixed(2)),
        getMetric("impressions"),
        getMetric("clicks"),
        Number(getMetric("ctr").toFixed(2)),
        getMetric("conversions"),
        Number(getMetric("cpr").toFixed(2)),
        Number(getMetric("revenue").toFixed(2)),
        Number(getMetric("roas").toFixed(2)),
      ];
      const textCols = [
        `"${(r.summary || "").replace(/"/g, '""')}"`,
        `"${(r.conclusion || "").replace(/"/g, '""')}"`,
        `"${(r.action || "").replace(/"/g, '""')}"`,
      ];

      return [...stringCols, ...numCols, ...textCols];
    });

    const csv = [headers.map((h) => `"${h}"`), ...rows]
      .map((r) => r.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reports-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV diexport!");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Weekly Reports</h1>
          <p className="text-sm text-muted">
            Laporan performa klien mingguan — auto-pull dari Ads Spend
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reports.length > 0 && (
            <button
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedIds(new Set());
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                bulkMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-gray-700 hover:bg-background"
              )}
              title={bulkMode ? "Buat Multi-Select" : "Bulk Action"}
            >
              <CheckCircle size={14} />
              <span className="hidden sm:inline">{bulkMode ? "Buat Multi-Select" : "Bulk Action"}</span>
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
            title="Export CSV"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              title="Auto-sync semua sheet tab (Januari-Juli '26) dari published Google Sheet"
            >
              {syncing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span className="hidden sm:inline">Syncing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  <span className="hidden sm:inline">Sync Now</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowSheetPreview(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
              title="Lihat semua sheet tabs (Januari-Juli '26) dari published Google Sheet — read-only preview"
            >
              <Eye size={14} />
              <span className="hidden sm:inline">Lihat Sheet</span>
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
              title="Import semua client dari Google Sheet publish-to-web"
            >
              <FileSpreadsheet size={14} />
              <span className="hidden sm:inline">Import dari Sheet</span>
            </button>
            <button onClick={openCreate} className="btn-primary" title="New Report">
              <Plus size={16} />
              <span>New Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sync Result Modal — tampilkan detail hasil sinkronisasi */}
      {showSyncResult && syncResult && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSyncResult(false);
          }}
        >
          <div
            className="my-4 w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">🔄 Hasil Sinkronisasi</h2>
                <p className="text-xs text-muted">
                  Selesai dalam {syncResult.summary.durationSec}s • {syncResult.summary.totalRows} rows diproses
                </p>
              </div>
              <button
                onClick={() => setShowSyncResult(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              {/* 🆕 P1: UX Messaging — interpretasi hasil sync supaya user tidak bingung */}
              {(() => {
                const { imported, updated, skipped, errors } = syncResult.summary;
                let icon = "✅";
                let title = "Data berhasil disinkronisasi";
                let desc = "";
                let bgClass = "border-success/30 bg-success/5";
                let titleClass = "text-success";

                if (errors > 0) {
                  icon = "⚠️";
                  title = `${errors} error terjadi saat sync`;
                  desc = "Beberapa baris gagal diproses. Lihat detail error di bawah.";
                  bgClass = "border-danger/30 bg-danger/5";
                  titleClass = "text-danger";
                } else if (imported === 0 && updated > 0 && skipped > 0) {
                  icon = "✅";
                  title = "Data sudah up-to-date";
                  desc = `Tidak ada data baru untuk diimpor. ${updated} report di-update dengan data terbaru dari sheet.`;
                  bgClass = "border-success/30 bg-success/5";
                  titleClass = "text-success";
                } else if (imported === 0 && updated === 0 && skipped > 0) {
                  icon = "ℹ️";
                  title = "Tidak ada perubahan";
                  desc = `Semua ${skipped} baris sudah ada di database. Sync bersifat idempotent — aman dijalankan berulang.`;
                  bgClass = "border-info/30 bg-info/5";
                  titleClass = "text-info";
                } else if (imported > 0) {
                  icon = "🎉";
                  title = "Data baru berhasil diimpor";
                  desc = `${imported} report baru ditambahkan${updated > 0 ? `, ${updated} report di-update` : ""}.`;
                }

                return (
                  <div className={`rounded-md border p-3 ${bgClass}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none">{icon}</span>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${titleClass}`}>{title}</p>
                        {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-md bg-success/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-muted">Imported</p>
                  <p className="text-xl font-bold text-success">{syncResult.summary.imported}</p>
                </div>
                <div className="rounded-md bg-primary/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-muted">Updated</p>
                  <p className="text-xl font-bold text-primary">{syncResult.summary.updated}</p>
                </div>
                <div className="rounded-md bg-surface p-3 text-center">
                  <p className="text-[10px] uppercase text-muted">Skipped</p>
                  <p className="text-xl font-bold text-muted">{syncResult.summary.skipped}</p>
                </div>
                <div className="rounded-md bg-danger/10 p-3 text-center">
                  <p className="text-[10px] uppercase text-muted">Errors</p>
                  <p className="text-xl font-bold text-danger">{syncResult.summary.errors}</p>
                </div>
              </div>

              {/* 🆕 Skipped Breakdown — transparency kenapa row di-skip */}
              {syncResult.summary.skippedBreakdown && syncResult.summary.skipped > 0 && (
                <div className="rounded-md border border-info/30 bg-info/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-info">
                    ℹ️ Mengapa {syncResult.summary.skipped} row di-skip?
                  </p>
                  <p className="mb-2 text-[10px] text-muted">
                    Breakdown alasan skip — bukan error, melainkan baris yang sengaja tidak diproses.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded bg-background p-2">
                      <p className="text-[9px] uppercase text-muted">No Metrics</p>
                      <p className="text-sm font-bold text-gray-900">
                        {syncResult.summary.skippedBreakdown.noMetrics}
                      </p>
                      <p className="text-[8px] text-muted">Baris naratif (KESIMPULAN, ACTION, dll)</p>
                    </div>
                    <div className="rounded bg-background p-2">
                      <p className="text-[9px] uppercase text-muted">No Client</p>
                      <p className="text-sm font-bold text-gray-900">
                        {syncResult.summary.skippedBreakdown.noClient}
                      </p>
                      <p className="text-[8px] text-muted">Baris kosong / separator</p>
                    </div>
                    <div className="rounded bg-background p-2">
                      <p className="text-[9px] uppercase text-muted">No Period</p>
                      <p className="text-sm font-bold text-gray-900">
                        {syncResult.summary.skippedBreakdown.noPeriod}
                      </p>
                      <p className="text-[8px] text-muted">Format tanggal tidak terdeteksi</p>
                    </div>
                    <div className="rounded bg-background p-2">
                      <p className="text-[9px] uppercase text-muted">Dedup</p>
                      <p className="text-sm font-bold text-gray-900">
                        {syncResult.summary.skippedBreakdown.dedup}
                      </p>
                      <p className="text-[8px] text-muted">Duplikat (sudah ada di sheet sebelumnya)</p>
                    </div>
                    <div className="rounded bg-warning/10 p-2">
                      <p className="text-[9px] uppercase text-warning">Unmatched</p>
                      <p className="text-sm font-bold text-warning">
                        {syncResult.summary.skippedBreakdown.unmatchedClient}
                      </p>
                      <p className="text-[8px] text-muted">Client tidak dikenali di DB</p>
                    </div>
                  </div>

                  {/* Samples — tampilkan contoh per kategori untuk debugging */}
                  {syncResult.summary.skippedBreakdown.samples && (
                    <div className="mt-2 space-y-2">
                      {([
                        ["unmatchedClient", "⚠️ Client tidak dikenali"],
                        ["dedup", "🔁 Row dedup (sudah ada)"],
                        ["noMetrics", "📝 Baris naratif"],
                        ["noPeriod", "📅 Format tanggal tidak terdeteksi"],
                      ] as const).map(([key, label]) => {
                        const items = syncResult.summary.skippedBreakdown!.samples?.[key] || [];
                        if (items.length === 0) return null;
                        return (
                          <div key={key} className="rounded bg-background p-2">
                            <p className="mb-1 text-[9px] font-semibold uppercase text-muted">{label}</p>
                            <ul className="space-y-0.5 text-[9px] text-muted">
                              {items.map((ex: string, i: number) => (
                                <li key={i} className="font-mono">
                                  {ex}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Per-sheet breakdown */}
              {syncResult.summary.sheets && syncResult.summary.sheets.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">📑 Breakdown per Sheet Tab</p>
                  <div className="space-y-1.5">
                    {syncResult.summary.sheets.map((s) => (
                      <div
                        key={s.gid}
                        className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <div className="flex gap-3 text-muted">
                          <span>{s.raw} rows</span>
                          <span>•</span>
                          <span>{s.parsed} parsed</span>
                          <span>•</span>
                          <span className="font-semibold text-success">{s.imported} imported</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched clients */}
              {syncResult.unmatchedClients.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-warning">
                    ⚠️ Client tidak dikenali ({syncResult.unmatchedClients.length})
                  </p>
                  <p className="mb-2 text-[10px] text-muted">
                    Nama di sheet tidak match dengan DB. Tambahkan ke Clients atau ubah nama di sheet.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {syncResult.unmatchedClients.map((c) => (
                      <span
                        key={c}
                        className="rounded bg-warning/10 px-2 py-0.5 text-[10px] text-warning"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors detail */}
              {syncResult.errors_detail.length > 0 && (
                <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
                  <p className="mb-1.5 text-xs font-semibold text-danger">
                    ❌ Detail Error ({syncResult.errors_detail.length})
                  </p>
                  <ul className="space-y-1 text-[10px] text-muted">
                    {syncResult.errors_detail.slice(0, 10).map((e, i) => (
                      <li key={i} className="font-mono">{e}</li>
                    ))}
                    {syncResult.errors_detail.length > 10 && (
                      <li className="text-muted italic">
                        ...dan {syncResult.errors_detail.length - 10} error lainnya
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* CTA */}
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  onClick={() => setShowSyncResult(false)}
                  className="btn-primary"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Sheet Modal */}
      <ImportSheetModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        clients={clients}
        defaultSheetUrl={DEFAULT_SHEET_URL}
        onImported={() => loadReports()}
      />

      {/* Sheet Preview Modal — lihat semua sheet tabs (read-only) */}
      <SheetPreviewModal
        open={showSheetPreview}
        onClose={() => setShowSheetPreview(false)}
        defaultUrl={DEFAULT_SHEET_URL}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Tab Navigation - Scrollable Carousel (sticky supaya konteks tidak hilang saat scroll) */}
      <div className="sticky top-0 z-20 -mx-4 mb-2 flex gap-1 overflow-x-auto border-b border-border bg-transparent px-4 pb-px backdrop-blur-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setActiveTab("list")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "list"
              ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]"
              : "border-transparent text-muted hover:text-gray-700"
          )}
        >
          <FileText size={14} /> Daftar Report
        </button>
        <button
          onClick={() => setActiveTab("compare")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "compare"
              ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]"
              : "border-transparent text-muted hover:text-gray-700"
          )}
        >
          <BarChart3 size={14} /> Multi-Week Compare
        </button>
        <button
          onClick={() => setActiveTab("automation")}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "automation"
              ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]"
              : "border-transparent text-muted hover:text-gray-700"
          )}
        >
          <Mail size={14} /> Automation
        </button>
      </div>

      {/* Content berdasarkan tab */}
      {activeTab === "automation" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <EmailScheduleManager clients={clients} />
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">📋 Tentang Auto Email</p>
            <div className="space-y-2 text-xs text-muted">
              <p>✅ Email otomatis dikirim setiap minggu sesuai jadwal yang diatur.</p>
              <p>✅ Cron job berjalan setiap jam untuk cek schedule yang aktif.</p>
              <p>✅ Email berisi link share report (berlaku 30 hari).</p>
              <p>✅ Sistem auto-skip jika report belum dibuat atau sudah dikirim.</p>
              <p>✅ Log pengiriman tersimpan di database untuk audit.</p>
            </div>
            <div className="mt-4 rounded-md bg-warning/10 p-3 text-xs text-warning">
              ⚠️ <strong>Setup Required:</strong> Set <code className="rounded bg-warning/20 px-1">RESEND_API_KEY</code> dan <code className="rounded bg-warning/20 px-1">CRON_SECRET</code> di Vercel env variables.
            </div>
          </div>
        </div>
      ) : activeTab === "compare" ? (
        <CompareView reports={reports} clients={clients} />
      ) : (
        <>
      {/* 🆕 Sprint 1.3: Quick Status Chips — 1-klik filter switch dengan counter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase text-muted">Status:</span>
        {([
          { key: "all", label: "Semua", count: statusCounts.all, color: "border-border bg-surface text-gray-700" },
          { key: "draft", label: "Draft", count: statusCounts.draft, color: "border-border bg-surface text-muted" },
          { key: "submitted", label: "Submitted", count: statusCounts.submitted, color: "border-warning/30 bg-warning/10 text-warning" },
          { key: "reviewed", label: "Reviewed", count: statusCounts.reviewed, color: "border-success/30 bg-success/10 text-success" },
        ] as const).map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all",
              chip.color,
              statusFilter === chip.key && "ring-2 ring-primary ring-offset-1 ring-offset-surface"
            )}
          >
            {chip.label}
            <span className="rounded-full bg-background px-1.5 text-[9px] tabular-nums">
              {chip.count}
            </span>
          </button>
        ))}

        {/* Active filter badge + reset — tampilkan hanya jika ada filter aktif */}
        {activeFilterCount > 0 && (
          <button
            onClick={resetAllFilters}
            className="ml-auto flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-[10px] font-medium text-danger transition-colors hover:bg-danger/20"
            title="Reset semua filter"
          >
            <X size={10} />
            {activeFilterCount} filter aktif • Reset
          </button>
        )}
      </div>

      {/* Search & Filter + View Mode Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client, ringkasan, performa, kesimpulan, action plan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {/* 🆕 Sprint 1.4: Filter PIC dropdown — hanya tampilkan PIC yang ada di reports */}
        <select value={filterPIC} onChange={(e) => setFilterPIC(e.target.value)} className="input w-auto">
          <option value="all">Semua PIC</option>
          {uniquePICs.map((pic) => (
            <option key={pic} value={pic}>
              {pic}
            </option>
          ))}
        </select>
        {/* 🆕 Sprint 1.4: Filter Objective dropdown — hanya tampilkan objective yang dipakai */}
        <select value={filterObjective} onChange={(e) => setFilterObjective(e.target.value)} className="input w-auto">
          <option value="all">Semua Objective</option>
          {uniqueObjectives.map((obj) => (
            <option key={obj.id} value={obj.id}>
              {obj.label}
            </option>
          ))}
        </select>

        {/* 🆕 Sprint 1.5: View Mode Toggle (Grid ↔ Table) */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "grid"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:bg-background hover:text-gray-700"
            )}
            title="Tampilan Grid (kartu)"
          >
            <LayoutGrid size={12} />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "table"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:bg-background hover:text-gray-700"
            )}
            title="Tampilan Tabel (rapih, sortable)"
          >
            <Table2 size={12} />
            <span className="hidden sm:inline">Tabel</span>
          </button>
        </div>
      </div>


      {/* ════════════════════════════════════════════ */}
      {/* 🆕 STICKY BULK ACTION BAR — muncul saat ada selection */}
      {/* ════════════════════════════════════════════ */}
      {showBulkBar && !loading && filtered.length > 0 && (
        <div className="sticky top-16 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-primary" />
            <span className="text-sm font-semibold text-primary">
              {selectedIds.size} report dipilih
            </span>
            <button
              onClick={toggleSelectAll}
              className="ml-1 rounded px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            >
              {selectedIds.size === visibleReports.length && visibleReports.length > 0
                ? "☑ Hilangkan Semua"
                : `☐ Pilih Semua (${visibleReports.length})`}
            </button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkExport}
              disabled={bulkProcessing}
              className="flex items-center gap-1 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
            >
              <Download size={12} /> Export Selected
            </button>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              disabled={bulkProcessing}
              className="input w-auto py-1.5 text-xs"
            >
              <option value="">Ubah Status...</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="reviewed">Reviewed</option>
            </select>
            {bulkStatus && (
              <button
                onClick={() => handleBulkUpdateStatus(bulkStatus)}
                disabled={bulkProcessing}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <Layers size={12} /> {bulkProcessing ? "Processing..." : "Apply Status"}
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={bulkProcessing}
              className="flex items-center gap-1 rounded-md bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
            >
              <Trash2 size={12} /> {bulkProcessing ? "Deleting..." : "Delete"}
            </button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setBulkMode(false);
                setBulkStatus("");
              }}
              disabled={bulkProcessing}
              className="px-3 py-1.5 text-xs text-muted hover:text-gray-900"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* 🆕 GMAIL-STYLE "Select All Filtered" BANNER   */}
      {/* ════════════════════════════════════════════ */}
      {/* Muncul saat user sudah "Pilih Semua" 12 cards yang visible,
          tapi masih ada ratusan filtered yang belum dipilih.
          Pattern Gmail: "Pilih semua percakapan di halaman ini" → "Pilih semua X percakapan" */}
      {showSelectAllFilteredBanner && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <span className="text-muted">
            Semua <b className="text-gray-900">{visibleReports.length}</b> report di halaman ini sudah dipilih.
          </span>
          <button
            onClick={selectAllFiltered}
            disabled={bulkProcessing}
            className="font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
          >
            Pilih semua <b>{filtered.length}</b> report yang sesuai filter →
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-muted">
            {reports.length === 0 ? "Belum ada laporan mingguan" : "Tidak ada laporan yang cocok dengan filter"}
          </p>
          {reports.length === 0 ? (
            <button onClick={openCreate} className="btn-primary mt-4">
              <Plus size={16} /> Buat Laporan Pertama
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setClientFilter("all");
              }}
              className="btn-primary mt-4"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : viewMode === "table" ? (
        // ════════════════════════════════════════════
        // 🆕 Sprint 2.3: TABLE VIEW — sortable columns
        // ════════════════════════════════════════════
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <SortableTh label="Client" sortKey="client.name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[200px]" />
                  <SortableTh label="Periode" sortKey="period_start" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[140px]" />
                  <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                  <SortableTh label="PIC" sortKey="pic.full_name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[140px]" />
                  <SortableTh label="Objective" sortKey="objective" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[140px]" />
                  <SortableTh label="Spend" sortKey="spend" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" className="w-[130px]" />
                  <SortableTh label="Conv" sortKey="conversions" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" className="w-[100px]" />
                  <SortableTh label="CTR" sortKey="ctr" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" className="w-[90px]" />
                  <SortableTh label="ROAS" sortKey="roas" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" className="w-[90px]" />
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted w-[100px]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleReports.map((r) => {
                  const metrics = r.report_metrics || [];
                  const spend = getMetric(metrics, "spend");
                  const ctr = getMetric(metrics, "ctr");
                  const roas = getMetric(metrics, "roas");
                  const conv = (() => {
                    for (const alias of METRIC_ALIASES.conversions) {
                      const v = metrics.filter((m) => m.metric_type === alias).reduce((s, m) => s + (m.value || 0), 0);
                      if (v > 0) return v;
                    }
                    return 0;
                  })();
                  const objLabel = r.objective ? (OBJECTIVE_MAP[r.objective]?.label || r.objective) : "-";
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-background"
                      onClick={() => setDetailReport(r)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{r.client?.name || "-"}</div>
                        {r.summary && (
                          <div className="line-clamp-1 text-[10px] text-muted">{r.summary}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {formatDate(r.period_start, { day: "numeric", month: "short" })} —{" "}
                        {formatDate(r.period_end, { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${statusColors[r.status] || statusColors.draft} text-[10px]`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">{r.pic?.full_name || "-"}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.objective ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">{objLabel}</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-gray-900">
                        {spend > 0 ? formatIDR(spend) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {conv > 0 ? formatCompact(conv) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {ctr > 0 ? `${ctr.toFixed(2)}%` : "-"}
                      </td>
                      <td className={cn(
                        "px-4 py-3 text-right text-xs font-medium tabular-nums",
                        roas > 0 ? (roas >= 3 ? "text-success" : roas >= 1 ? "text-warning" : "text-danger") : "text-muted"
                      )}>
                        {roas > 0 ? `${roas.toFixed(2)}x` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setDetailReport(r)}
                            className="rounded p-1 text-muted hover:bg-background hover:text-primary"
                            title="Lihat detail"
                          >
                            <Eye size={12} />
                          </button>
                          <button
                            onClick={() => openEdit(r)}
                            className="rounded p-1 text-muted hover:bg-background hover:text-primary"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="rounded p-1 text-muted hover:bg-background hover:text-danger"
                            title="Hapus"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load More for table view */}
          {filtered.length > visibleCount && (
            <div className="flex flex-col items-center gap-2 border-t border-border py-4">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background hover:text-primary"
              >
                <ChevronDown size={14} />
                Load More
                <span className="text-muted">({filtered.length - visibleCount} remaining)</span>
              </button>
              <p className="text-[10px] text-muted">
                Showing {visibleReports.length} of {filtered.length} reports
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2">
          {visibleReports.map((r) => {
            const metrics = r.report_metrics || [];
            // 🆕 Card render: pakai alias resolver
            const spendVal = getMetric(metrics, "spend");
            const spend = spendVal > 0 ? spendVal : null;
            // Hindari double-count conversions: ambil alias pertama yang ada
            const conversionsVal = (() => {
              for (const alias of METRIC_ALIASES.conversions) {
                const v = metrics
                  .filter((m) => m.metric_type === alias)
                  .reduce((s, m) => s + (m.value || 0), 0);
                if (v > 0) return v;
              }
              return 0;
            })();
            const conversions = conversionsVal > 0 ? conversionsVal : null;
            const roasVal = getMetric(metrics, "roas");
            const roas = roasVal > 0 ? roasVal : null;
            const ctrVal = getMetric(metrics, "ctr");
            const ctr = ctrVal > 0 ? ctrVal : null;
            const hasMetrics = metrics.length > 0;
            const isSelected = selectedIds.has(r.id);

            return (
              <div
                key={r.id}
                className={cn(
                  "card card-hover group cursor-pointer",
                  bulkMode && isSelected && "ring-2 ring-primary"
                )}
                onClick={() => {
                  if (bulkMode) {
                    const next = new Set(selectedIds);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    setSelectedIds(next);
                  } else {
                    setDetailReport(r);
                  }
                }}
              >
                {bulkMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const next = new Set(selectedIds);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      setSelectedIds(next);
                    }}
                    className="absolute right-3 top-3 h-4 w-4 rounded border-border"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{r.client?.name || "Unknown Client"}</h3>
                    <p className="text-xs text-muted">
                      {formatDate(r.period_start, { day: "numeric", month: "short" })} —{" "}
                      {formatDate(r.period_end, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className={`badge ${statusColors[r.status] || statusColors.draft}`}>{r.status}</span>
                </div>

                {/* 🎯 Key Metrics Bar — OBJECTIVE-AWARE
                    Card yang ditampilkan menyesuaikan objective report:
                    - CTWA    → SPEND, MSGS, COST/MSG, OC→WA
                    - Sales   → SPEND, ROAS, PURCHASES, AOV
                    - CPAS    → SPEND, ROAS, REVENUE, AOV
                    - Traffic → SPEND, LINKS, CTR, CPC
                    Fallback (no objective) → SPEND, CONV, CTR, ROAS */}
                {hasMetrics ? (
                  <div className="mb-3 grid grid-cols-4 gap-2 rounded-md border border-border bg-background p-2">
                    {getObjectiveCardMetrics(r.objective, metrics).map((card, idx) => (
                      <div key={idx} className="text-center">
                        <p className="text-[9px] text-muted">{card.label}</p>
                        <p className={cn("text-xs font-bold", card.color || "text-gray-900")}>
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {r.summary && <p className="mb-2 line-clamp-2 text-sm text-muted">{r.summary}</p>}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted">PIC: {r.pic?.full_name || "-"}</span>
                  <div
                    className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 👁️ Tombol "Lihat Detail" — show on hover (konsisten dengan Edit/Clone/Delete) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('[reports] open detail via eye button', r.id);
                        setDetailReport(r);
                      }}
                      className="flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-gray-700 transition-colors hover:bg-background hover:text-primary"
                      title="Lihat detail"
                      data-testid={`report-detail-btn-${r.id}`}
                    >
                      <Eye size={12} /> Detail
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleClone(r)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-accent"
                      title="Clone untuk minggu depan"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 🆕 Load More pagination — tampilkan sisa cards bertahap (12 per klik)
            Kenapa Load More, bukan pagination klasik (1, 2, 3, Next):
            - UX: user bisa lihat semua cards dalam 1 viewport tanpa harus klik halaman
            - Performance: tetap limiting DOM nodes (12 → 24 → 36, dst.)
            - Mobile-friendly: lebih mudah dari pada tap target pagination kecil
            - Default 12 cards cocok untuk grid 2-col (6 rows × 2 col = 12) */}
        {filtered.length > visibleCount && (
          <div className="flex flex-col items-center gap-2 py-6">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background hover:text-primary"
            >
              <ChevronDown size={14} className="animate-bounce" />
              Load More
              <span className="text-muted">
                ({filtered.length - visibleCount} remaining)
              </span>
            </button>
            <p className="text-[10px] text-muted">
              Showing {visibleReports.length} of {filtered.length} reports
            </p>
          </div>
        )}

        {/* Counter info kalau dataset kecil (tidak melewati PAGE_SIZE) */}
        {filtered.length > 0 && filtered.length <= visibleCount && (
          <p className="pb-2 text-center text-[10px] text-muted">
            Showing all {filtered.length} report{filtered.length === 1 ? "" : "s"}
          </p>
        )}
        </>
      )}
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* CREATE/EDIT MODAL                              */}
      {/* ════════════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {editingId ? "Edit Weekly Report" : "Buat Weekly Report"}
                </h2>
                <p className="text-xs text-muted">Lengkapi metrik iklan & insight performa</p>
              </div>
              <button
                onClick={closeModal}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
              {/* Client & Period */}
              <div className="space-y-3 rounded-lg bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">Client & Periode</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Client *</label>
                    <select
                      required
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih Client —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Periode Mulai *</label>
                    <input
                      type="date"
                      required
                      value={form.period_start}
                      onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Periode Selesai *</label>
                    <input
                      type="date"
                      required
                      value={form.period_end}
                      onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
                {/* Bug fix B4: validation hint */}
                {form.period_start && form.period_end && new Date(form.period_start) > new Date(form.period_end) && (
                  <p className="text-xs text-danger">⚠️ Periode mulai tidak boleh setelah periode selesai</p>
                )}

                {/* P11: Objective Selector */}
                <div className="border-t border-border pt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-700">🎯 Campaign Objective</label>
                  <ObjectiveSelector
                    value={form.objective}
                    onChange={(obj) => setForm({ ...form, objective: obj })}
                  />
                </div>

                {/* Auto-Pull Button */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={handlePullAds}
                    disabled={pulling || !form.client_id || !form.period_start || !form.period_end}
                    className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
                  >
                    {pulling ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Pulling data...
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Pull dari Ads Data
                      </>
                    )}
                  </button>
                  {pulledData?.hasData && (
                    <span className="badge bg-success/20 text-success">
                      ✅ {pulledData.accountCount} akun • {formatIDR(pulledData.metrics.spend)}
                    </span>
                  )}
                  {loadingPrevious && (
                    <span className="text-xs text-muted">
                      <Loader2 size={12} className="inline animate-spin" /> Cek minggu sebelumnya...
                    </span>
                  )}
                </div>
              </div>

              {/* Platform Breakdown dari pulled data */}
              {pulledData?.hasData && pulledData.platformBreakdown.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">Breakdown Per Platform</p>
                  <div className="space-y-2">
                    {pulledData.platformBreakdown.map((p) => (
                      <div key={p.platform} className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs">
                        <span className={cn("badge", platformColors[p.platform] || "bg-surface text-muted")}>
                          {p.platform}
                        </span>
                        <div className="flex gap-4">
                          <span className="text-muted">
                            Spend: <b className="text-gray-900">{formatIDR(p.spend)}</b>
                          </span>
                          <span className="text-muted">
                            CTR: <b className="text-gray-900">{p.ctr.toFixed(2)}%</b>
                          </span>
                          <span className="text-muted">
                            CPR: <b className="text-gray-900">{p.cpr > 0 ? formatIDR(p.cpr) : "-"}</b>
                          </span>
                          <span className="text-muted">
                            ROAS:{" "}
                            <b className={p.roas >= 3 ? "text-success" : p.roas >= 1 ? "text-warning" : "text-danger"}>
                              {p.roas > 0 ? `${p.roas.toFixed(2)}x` : "-"}
                            </b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── F2: Budget Pacing + F4: Frequency Alert ─── */}
              {pulledData?.hasData && pulledData.budgetPacing && pulledData.budgetPacing.targetSpend > 0 && (
                <div className="rounded-lg border border-border bg-gradient-to-br from-accent/5 to-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted">🎯 Budget Pacing</p>
                    <span className="text-[10px] text-muted">
                      {pulledData.metrics.frequency > 0 && (
                        <>
                          {pulledData.metrics.frequency > 3 ? (
                            <span className="text-danger font-semibold">⚠️ Frequency {pulledData.metrics.frequency}x — Audience Jenuh!</span>
                          ) : (
                            <span className="text-success">Frequency {pulledData.metrics.frequency}x — OK</span>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  {(() => {
                    const bp = pulledData.budgetPacing!;
                    const pacingColor =
                      bp.pacingPercent >= 95 ? "text-success" :
                      bp.pacingPercent >= 70 ? "text-warning" :
                      bp.pacingPercent >= 40 ? "text-warning" : "text-danger";
                    const pacingBg =
                      bp.pacingPercent >= 95 ? "bg-success" :
                      bp.pacingPercent >= 70 ? "bg-warning" : "bg-danger";

                    return (
                      <div className="space-y-2">
                        {/* Progress bar */}
                        <div className="relative h-4 w-full overflow-hidden rounded-full bg-background">
                          <div
                            className={cn("h-full rounded-full transition-all", pacingBg)}
                            style={{ width: `${Math.min(bp.pacingPercent, 100)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                            {bp.pacingPercent}%
                          </span>
                        </div>
                        {/* Detail stats */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div>
                            <p className="text-muted">Target</p>
                            <p className="font-bold text-gray-900">{formatIDR(bp.targetSpend)}</p>
                          </div>
                          <div>
                            <p className="text-muted">Actual</p>
                            <p className={cn("font-bold", pacingColor)}>{formatIDR(bp.actualSpend)}</p>
                          </div>
                          <div>
                            <p className="text-muted">Sisa Budget</p>
                            <p className="font-bold text-gray-900">{formatIDR(bp.remainingBudget)}</p>
                          </div>
                        </div>
                        {/* Status alert */}
                        {bp.pacingPercent < 40 && (
                          <p className="text-center text-[10px] text-danger font-medium">
                            ⚠️ Spending terlalu lambat! Hanya {bp.pacingPercent}% dari target ({bp.activeAccountCount} akun aktif, {bp.periodDays} hari)
                          </p>
                        )}
                        {bp.pacingPercent >= 95 && bp.pacingPercent <= 105 && (
                          <p className="text-center text-[10px] text-success font-medium">
                            ✅ Pacing on-track! Spend optimal sesuai target harian
                          </p>
                        )}
                        {bp.pacingPercent > 105 && (
                          <p className="text-center text-[10px] text-warning font-medium">
                            🔴 Overspending! {bp.pacingPercent}% dari target ({bp.periodDays} hari)
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ─── F1: Funnel Visualization ─── */}
              {pulledData?.hasData && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">🔻 Funnel Visualization</p>
                  {(() => {
                    const m = pulledData.metrics;
                    const steps = [
                      { label: "Impressions", value: m.impressions, pct: 100, color: "bg-primary" },
                      {
                        label: "Clicks",
                        value: m.clicks,
                        pct: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
                        color: "bg-accent",
                      },
                      {
                        label: "Conversions",
                        value: m.conversions,
                        pct: m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0,
                        color: "bg-success",
                      },
                    ];
                    return (
                      <div className="space-y-1.5">
                        {steps.map((s, i) => (
                          <div key={s.label} className="flex items-center gap-2">
                            <span className="w-24 text-[10px] text-muted">{s.label}</span>
                            <div className="relative h-6 flex-1 overflow-hidden rounded bg-background">
                              <div
                                className={cn("h-full rounded transition-all", s.color)}
                                style={{ width: `${Math.max(s.pct, 5)}%`, opacity: 1 - i * 0.15 }}
                              />
                              <span className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold text-white">
                                <span>{formatCompact(s.value)}</span>
                                <span>{s.pct.toFixed(1)}%</span>
                              </span>
                            </div>
                          </div>
                        ))}
                        {/* Conversion rate summary */}
                        <div className="flex justify-between pt-1 text-[10px]">
                          <span className="text-muted">
                            CTR: <b className="text-gray-900">{m.ctr.toFixed(2)}%</b>
                          </span>
                          <span className="text-muted">
                            CVR:{" "}
                            <b className={m.clicks > 0 && (m.conversions / m.clicks) * 100 >= 2 ? "text-success" : "text-warning"}>
                              {m.clicks > 0 ? ((m.conversions / m.clicks) * 100).toFixed(2) : "0"}%
                            </b>
                          </span>
                          <span className="text-muted">
                            ROAS:{" "}
                            <b className={m.roas >= 3 ? "text-success" : m.roas >= 1 ? "text-warning" : "text-danger"}>
                              {m.roas.toFixed(2)}x
                            </b>
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Structured Metrics Grid — FASE 1 */}
              <div className="space-y-3 rounded-lg bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-muted">
                    Metrik Iklan (Structured)
                  </p>
                  {Object.keys(previousMetrics).length > 0 && (
                    <span className="badge bg-primary/10 text-primary text-[10px]">
                      📊 WoW comparison aktif
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {METRIC_DEFS.map((m) => {
                    const val = form.metrics[m.key];
                    const prev = previousMetrics[m.key];
                    const delta = calcWowDelta(val ? Number(val) : null, prev || null);

                    return (
                      <div key={m.key} className="rounded-md border border-border bg-surface p-2">
                        <label className="mb-0.5 flex items-center justify-between text-[10px] font-medium text-muted">
                          <span>{m.label}</span>
                          {m.derived && (
                            <span className="rounded bg-primary/10 px-1 text-[8px] text-primary">auto</span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={val ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              metrics: {
                                ...form.metrics,
                                [m.key]: e.target.value === "" ? "" : parseFloat(e.target.value),
                              },
                            })
                          }
                          placeholder="0"
                          className="w-full rounded border-border bg-background px-2 py-1 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        {/* WoW delta */}
                        {delta !== null && (
                          <div className="mt-0.5 flex items-center gap-1 text-[9px]">
                            {delta > 0 ? (
                              <TrendingUp size={9} className="text-success" />
                            ) : delta < 0 ? (
                              <TrendingDown size={9} className="text-danger" />
                            ) : (
                              <Minus size={9} className="text-muted" />
                            )}
                            <span
                              className={cn(
                                delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
                              )}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)}% vs {formatMetric(prev, m.unit)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── P1: AI Generate Button ─── */}
              <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-primary/5 to-accent/5 p-3">
                <div>
                  <p className="text-xs font-semibold text-gray-900">⚡ Auto-Generate Naratif</p>
                  <p className="text-[10px] text-muted">Buat ringkasan, kesimpulan & action plan otomatis dari metrik</p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateText}
                  disabled={generating}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} /> Generate dengan AI
                    </>
                  )}
                </button>
              </div>

              {/* Text fields */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Ringkasan</label>
                <textarea
                  rows={2}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="Ringkasan aktivitas/capaian minggu ini..."
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Performance Notes</label>
                <textarea
                  rows={2}
                  value={form.performance_text}
                  onChange={(e) => setForm({ ...form, performance_text: e.target.value })}
                  placeholder="Insight tambahan (creative performing, audience, dll)..."
                  className="input resize-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Kesimpulan</label>
                  <textarea
                    rows={2}
                    value={form.conclusion}
                    onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                    placeholder="Kesimpulan & insight..."
                    className="input resize-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Action Plan</label>
                  <textarea
                    rows={2}
                    value={form.action}
                    onChange={(e) => setForm({ ...form, action: e.target.value })}
                    placeholder="Rencana aksi minggu depan..."
                    className="input resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="input"
                >
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : editingId ? (
                    "Update Laporan"
                  ) : (
                    "Simpan Laporan"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* DETAIL VIEW MODAL                              */}
      {/* ════════════════════════════════════════════ */}
      {detailReport && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailReport(null);
          }}
        >
          <div
            className="print-area my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Print-only header */}
            <div className="print-header">
              <h1 className="text-xl font-bold">Hadona Workspace — Weekly Report</h1>
              <p className="text-xs">{detailReport.client?.name} • {formatDate(detailReport.period_start)} - {formatDate(detailReport.period_end)}</p>
            </div>

            <div className="no-print flex shrink-0 items-start justify-between border-b border-border bg-surface px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">
                    {detailReport.client?.name || "Unknown Client"}
                  </h2>
                  <span className={`badge ${statusColors[detailReport.status] || statusColors.draft}`}>
                    {detailReport.status}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {formatDate(detailReport.period_start, { day: "numeric", month: "long" })} —{" "}
                  {formatDate(detailReport.period_end, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="flex gap-2">
                <ShareButton report={detailReport} />
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-gray-700 hover:bg-background"
                  title="Print / Save as PDF"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    setDetailReport(null);
                    openEdit(detailReport);
                  }}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-primary hover:bg-background"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => setDetailReport(null)}
                  className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="min-h-0 overflow-y-auto px-6 py-4">
            {/* Metrics Display */}
            {detailReport.report_metrics && detailReport.report_metrics.length > 0 && (
              <div className="print-card mb-4 rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted">📊 Metrik Iklan</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {METRIC_DEFS.map((m) => {
                    const metricVals = detailReport.report_metrics!.filter((x) => x.metric_type === m.key);
                    if (metricVals.length === 0) return null;
                    const val = metricVals.reduce((s, x) => s + (x.value || 0), 0);
                    const prev = metricVals[0]?.previous_value;
                    const delta = calcWowDelta(val, prev);

                    // Anomaly detection: >30% change = flag
                    const isAnomaly = delta !== null && Math.abs(delta) > 30;

                    return (
                      <div key={m.key} className="rounded border border-border bg-surface p-2 text-center">
                        <p className="text-[9px] text-muted">
                          {m.label}
                          {isAnomaly && <span className="ml-0.5 text-warning" title="Anomali: perubahan >30% vs minggu lalu">⚠️</span>}
                        </p>
                        <p className="text-sm font-bold text-gray-900">{formatMetric(val, m.unit)}</p>
                        {delta !== null && (
                          <p
                            className={cn(
                              "text-[9px] flex items-center justify-center gap-0.5",
                              delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
                            )}
                          >
                            {delta > 0 ? <TrendingUp size={8} /> : delta < 0 ? <TrendingDown size={8} /> : <Minus size={8} />}
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trend Chart — FASE 2 */}
            {chartData.length > 1 && (
              <div className="mb-4 rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted">📈 Trend 8 Minggu Terakhir</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDetailSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorDetailRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#9ca3af" }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      axisLine={false}
                      tickLine={false}
                      width={35}
                    />
                    <Tooltip
                      formatter={(value: number) => formatIDR(value)}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                    />
                    <Area type="monotone" dataKey="spend" stroke="#f59e0b" strokeWidth={2} fill="url(#colorDetailSpend)" name="Spend" />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#colorDetailRev)" name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* P11: Objective-Aware KPI Bar */}
            {detailReport.objective && detailReport.report_metrics && detailReport.report_metrics.length > 0 && (
              <div className="mb-4">
                <ObjectiveKPIBar
                  objectiveId={detailReport.objective}
                  metrics={Object.fromEntries(
                    detailReport.report_metrics.map((m) => [m.metric_type, m.value])
                  )}
                  previousMetrics={Object.fromEntries(
                    detailReport.report_metrics
                      .filter((m) => m.previous_value !== null)
                      .map((m) => [m.metric_type, m.previous_value])
                  )}
                />
              </div>
            )}

            {/* Goal Tracking — FITUR 1 */}
            {(() => {
              const ms = detailReport.report_metrics || [];
              const get = (t: string): number | undefined => {
                const v = ms.find((x) => x.metric_type === t)?.value;
                return v ?? undefined;
              };
              return (
                <div className="mb-4">
                  <GoalTracker
                    clientId={detailReport.client_id}
                    actualMetrics={{
                      roas: get("roas"),
                      cpr: get("cpr"),
                      spend: get("spend"),
                      conversions: get("conversions"),
                      ctr: get("ctr"),
                      cpa: get("cpr"), // cpa ≈ cpr dalam konteks ini
                    }}
                  />
                </div>
              );
            })()}

            {/* Creative Performance Tracker — FITUR 3 */}
            <div className="mb-4">
              <CreativePerformanceTracker reportId={detailReport.id} />
            </div>

            {/* Text sections */}
            {detailReport.summary && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Ringkasan</p>
                <p className="text-sm text-gray-700">{detailReport.summary}</p>
              </div>
            )}
            {detailReport.performance_text && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Performance Notes</p>
                <p className="text-sm text-gray-700">{detailReport.performance_text}</p>
              </div>
            )}
            {detailReport.conclusion && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Kesimpulan</p>
                <p className="text-sm text-gray-700">{detailReport.conclusion}</p>
              </div>
            )}
            {detailReport.action && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-semibold uppercase text-muted">Action Plan</p>
                <p className="text-sm text-gray-700">{detailReport.action}</p>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
              <span>PIC: {detailReport.pic?.full_name || "-"}</span>
              <span>Dibuat: {formatDate(detailReport.created_at)}</span>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
