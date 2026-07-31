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

  // Bulk Actions state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const spend = metrics
        .filter((m) => m.metric_type === "spend")
        .reduce((s, m) => s + (m.value || 0), 0);
      const conversions = metrics
        .filter((m) => m.metric_type === "conversions")
        .reduce((s, m) => s + (m.value || 0), 0);
      const revenue = metrics
        .filter((m) => m.metric_type === "revenue")
        .reduce((s, m) => s + (m.value || 0), 0);

      return {
        period: `${formatDate(r.period_start, { day: "numeric", month: "short" })}`,
        spend,
        conversions,
        revenue,
      };
    });
    setChartData(data);
  }, [detailReport, reports]);

  // ─── Filter logic (B3 fix: include conclusion & action) ───
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
    return matchSearch && matchStatus && matchClient;
  });

  // ─── Stats ───
  const totalReports = reports.length;
  const draftCount = reports.filter((r) => r.status === "draft").length;
  const submittedCount = reports.filter((r) => r.status === "submitted").length;
  const reviewedCount = reports.filter((r) => r.status === "reviewed").length;

  // Total spend dari semua report yang punya metrics
  const totalSpend = reports.reduce((sum, r) => {
    const spend = (r.report_metrics || [])
      .filter((m) => m.metric_type === "spend")
      .reduce((s, m) => s + (m.value || 0), 0);
    return sum + spend;
  }, 0);

  const totalConversions = reports.reduce((sum, r) => {
    const conv = (r.report_metrics || [])
      .filter((m) => m.metric_type === "conversions")
      .reduce((s, m) => s + (m.value || 0), 0);
    return sum + conv;
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
      const getMetric = (type: string) => {
        const m = metrics.find((x) => x.metric_type === type);
        return m?.value || 0;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Reports</h1>
          <p className="text-sm text-muted">
            Laporan performa klien mingguan — auto-pull dari Ads Spend
          </p>
        </div>
        <div className="flex gap-2">
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
            >
              <CheckCircle size={14} /> {bulkMode ? "Buat Multi-Select" : "Bulk Action"}
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
          >
            <Download size={14} /> Export
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Report
          </button>
        </div>
      </div>

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

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("list")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-gray-700"
          )}
        >
          <FileText size={14} /> Daftar Report
        </button>
        <button
          onClick={() => setActiveTab("compare")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "compare"
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-gray-700"
          )}
        >
          <BarChart3 size={14} /> Multi-Week Compare
        </button>
        <button
          onClick={() => setActiveTab("automation")}
          className={cn(
            "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            activeTab === "automation"
              ? "border-primary text-primary"
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
      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
        </select>
      </div>

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
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => {
            const metrics = r.report_metrics || [];
            const spend = metrics.find((m) => m.metric_type === "spend")?.value || null;
            const conversions = metrics.find((m) => m.metric_type === "conversions")?.value || null;
            const roas = metrics.find((m) => m.metric_type === "roas")?.value || null;
            const ctr = metrics.find((m) => m.metric_type === "ctr")?.value || null;
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

                {/* Key Metrics Bar — auto dari report_metrics */}
                {hasMetrics ? (
                  <div className="mb-3 grid grid-cols-4 gap-2 rounded-md border border-border bg-background p-2">
                    <div className="text-center">
                      <p className="text-[9px] text-muted">SPEND</p>
                      <p className="text-xs font-bold text-gray-900">{spend ? formatIDR(spend) : "-"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted">CONV</p>
                      <p className="text-xs font-bold text-gray-900">{conversions || "-"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted">CTR</p>
                      <p className="text-xs font-bold text-gray-900">{ctr ? `${ctr}%` : "-"}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-muted">ROAS</p>
                      <p className={cn("text-xs font-bold", (roas ?? 0) >= 3 ? "text-success" : (roas ?? 0) >= 1 ? "text-warning" : "text-danger")}>
                        {roas ? `${roas}x` : "-"}
                      </p>
                    </div>
                  </div>
                ) : null}

                {r.summary && <p className="mb-2 line-clamp-2 text-sm text-muted">{r.summary}</p>}

                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted">PIC: {r.pic?.full_name || "-"}</span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
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
      )}
        </>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* CREATE/EDIT MODAL                              */}
      {/* ════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
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

            <form onSubmit={handleSave} className="space-y-4">
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

              <div className="flex justify-end gap-2 pt-2">
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="print-area my-8 w-full max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-xl">
            {/* Print-only header */}
            <div className="print-header">
              <h1 className="text-xl font-bold">Hadona Workspace — Weekly Report</h1>
              <p className="text-xs">{detailReport.client?.name} • {formatDate(detailReport.period_start)} - {formatDate(detailReport.period_end)}</p>
            </div>

            <div className="no-print mb-4 flex items-start justify-between">
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
      )}
    </div>
  );
}