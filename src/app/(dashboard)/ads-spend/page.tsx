"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlertCircle,
  Search,
  Plus,
  X,
  Pencil,
  Trash2,
  Megaphone,
  Loader2,
  Download,
  User,
  TrendingDown,
  DollarSign,
  Activity,
  ClipboardList,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  Link2,
  Unlink,
  KeyRound,
  ExternalLink,
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
import { formatIDR, cn, extractError } from "@/lib/utils";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";

interface AdAccount {
  id: string;
  platform: string;
  ad_account_id: string;
  account_name: string | null;
  objective: string | null;
  daily_budget: number | null;
  remaining_budget: number | null;
  days_left: number | null;
  status: string;
  notes: string | null;
  client_id: string;
  pic_id: string | null;
  meta_sync_enabled?: boolean | null;
  meta_connection_id?: string | null;
  client?: { name: string };
  pic?: { full_name: string | null } | null;
}

interface SpendLog {
  id: string;
  ad_account_id: string;
  log_date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  notes: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
}

interface MetaConnection {
  id: string;
  fb_user_name: string | null;
  is_active: boolean;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  token_expires_at: string | null;
}

interface TrendData {
  date: string;
  spend: number;
  revenue: number;
}

const emptyForm = {
  client_id: "",
  platform: "META",
  ad_account_id: "",
  account_name: "",
  objective: "",
  daily_budget: "",
  remaining_budget: "",
  status: "active",
  notes: "",
  pic_id: "",
};

const emptySpendForm = {
  log_date: new Date().toISOString().split("T")[0],
  spend: "",
  impressions: "",
  clicks: "",
  conversions: "",
  revenue: "",
  notes: "",
};

export default function AdsSpendPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [spendLogs, setSpendLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Trend chart range
  const [chartRange, setChartRange] = useState<7 | 30>(7);

  // Modal: Create/Edit Ad Account
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Modal: Spend Log
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [spendAccountId, setSpendAccountId] = useState<string | null>(null);
  const [spendForm, setSpendForm] = useState(emptySpendForm);
  const [savingSpend, setSavingSpend] = useState(false);

  // Meta Connection
  const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Manual Token Modal (fallback if OAuth fails)
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Import Sheet Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrMQ3VuFWBGtfbf8P-EV2kGEv6GB2UnCqXSgUNiNh4aTXEQD7mECzrnnWsAeF7rllx6dOCIpKImTLR/pubhtml"
  );
  const [sheetColumn, setSheetColumn] = useState("E");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadClients();
    loadTeam();
    loadSpendLogs();
    loadMetaConnection();
    checkUrlParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected")) {
      const linked = params.get("meta_linked");
      const msg = linked
        ? `Meta terhubung! ${linked} ad account otomatis di-link & auto-sync diaktifkan.`
        : "Meta account berhasil terhubung!";
      toast.success(msg);
      window.history.replaceState({}, "", "/ads-spend");
    }
    const metaError = params.get("meta_error");
    if (metaError) {
      const errorMessages: Record<string, string> = {
        not_configured: "Meta App belum dikonfigurasi. Hubungi admin untuk set META_APP_ID & META_APP_SECRET di Vercel/ENV.",
        auth_failed: "Gagal connect ke Facebook. Coba lagi atau hubungi admin.",
        permission_denied: "Anda menolak izin akses Meta.",
        missing_params: "Parameter tidak lengkap. Coba connect ulang.",
        state_mismatch: "Sesi tidak valid. Coba connect ulang.",
        db_error: "Gagal menyimpan koneksi ke database.",
      };
      toast.error(errorMessages[metaError] || `Meta Error: ${metaError.replace(/_/g, " ")}`);
      window.history.replaceState({}, "", "/ads-spend");
    }
  }

  async function handleToggleSync(accountId: string, currentEnabled: boolean) {
    setTogglingId(accountId);
    try {
      const { error } = await supabase
        .from("ad_accounts")
        .update({ meta_sync_enabled: !currentEnabled } as never)
        .eq("id", accountId);
      if (error) throw error;

      toast.success(`Auto-sync ${!currentEnabled ? "diaktifkan" : "dimatikan"}`);
      loadAccounts();
    } catch (err) {
      toast.error("Gagal toggle sync: " + extractError(err));
    } finally {
      setTogglingId(null);
    }
  }

  async function loadMetaConnection() {
    try {
      const { data } = await supabase
        .from("meta_connections")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setMetaConnection((data as unknown as MetaConnection[])[0] || null);
      }
    } catch {
      // Table might not exist yet
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || data.error || "Sync failed");

      // Build detailed toast message
      const parts: string[] = [];
      if (data.accounts_imported > 0) parts.push(`📥 ${data.accounts_imported} akun baru`);
      if (data.accounts_matched > 0) parts.push(`🔗 ${data.accounts_matched} akun di-match`);
      if (data.total_records > 0) parts.push(`💰 ${data.total_records} spend record`);

      if (parts.length > 0) {
        toast.success(`Sync selesai! ${parts.join(" • ")}`, { duration: 6000 });
      } else if (data.connections_synced === 0) {
        toast.info("Tidak ada koneksi Meta yang aktif");
      } else {
        toast.info(`Sync selesai. Tidak ada data baru untuk kemarin.`);
      }

      // FIX: Also reload accounts so newly imported ones appear in table
      loadAccounts();
      loadSpendLogs();
      loadMetaConnection();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal sync: " + msg);
    } finally {
      setSyncing(false);
    }
  }

  async function handleManualTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualToken.trim() || manualToken.trim().length < 20) {
      toast.error("Token tidak valid. Pastikan copy token dengan benar.");
      return;
    }

    setSavingToken(true);
    try {
      const res = await fetch("/api/meta/manual-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: manualToken.trim() }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Gagal menyimpan token");

      toast.success(
        `✅ ${data.message || "Meta terhubung!"} ${data.ad_accounts_linked > 0 ? `(${data.ad_accounts_linked} ad account ter-link)` : ""}`
      );
      setShowTokenModal(false);
      setManualToken("");
      loadMetaConnection();
      loadAccounts();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    } finally {
      setSavingToken(false);
    }
  }

  async function handleImportSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim()) {
      toast.error("URL Sheet wajib diisi");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/import/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          column: sheetColumn,
          platform: "META",
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Import gagal");

      toast.success(data.message || `Import selesai! ${data.imported} baru.`);
      setShowImportModal(false);
      loadAccounts();
    } catch (err) {
      toast.error("Gagal import: " + extractError(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleDisconnectMeta() {
    if (!metaConnection) return;
    if (!confirm("Putuskan koneksi Meta? Anda perlu connect ulang untuk sync otomatis.")) return;

    try {
      await supabase
        .from("meta_connections")
        .update({ is_active: false, auto_sync: false } as never)
        .eq("id", metaConnection.id);
      toast.success("Koneksi Meta diputus");
      setMetaConnection(null);
    } catch (err) {
      toast.error("Gagal disconnect: " + extractError(err));
    }
  }

  async function loadAccounts() {
    try {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, client:clients(name), pic:profiles!pic_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setAccounts((data as unknown as AdAccount[]) || []);
    } catch (err) {
      const msg = extractError(err);
      setError("Gagal memuat data: " + msg);
      toast.error("Gagal memuat ad accounts");
    } finally {
      setLoading(false);
    }
  }

  async function loadSpendLogs() {
    try {
      // Load last 30 days of spend logs
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("ad_spend_logs")
        .select("*")
        .gte("log_date", thirtyDaysAgo.toISOString().split("T")[0])
        .order("log_date", { ascending: true });

      if (error) throw error;
      setSpendLogs((data as unknown as SpendLog[]) || []);
    } catch (err) {
      // Table might not exist yet (migration not run)
      console.warn("Spend logs not loaded:", extractError(err));
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function loadTeam() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");
    setTeam((data as unknown as TeamMember[]) || []);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(account: AdAccount) {
    setForm({
      client_id: account.client_id,
      platform: account.platform,
      ad_account_id: account.ad_account_id,
      account_name: account.account_name || "",
      objective: account.objective || "",
      daily_budget: account.daily_budget?.toString() || "",
      remaining_budget: account.remaining_budget?.toString() || "",
      status: account.status,
      notes: account.notes || "",
      pic_id: account.pic_id || "",
    });
    setEditingId(account.id);
    setShowModal(true);
  }

  function openSpendLog(accountId: string) {
    setSpendAccountId(accountId);
    setSpendForm(emptySpendForm);
    setShowSpendModal(true);
  }

  // Auto-calc days_left from remaining / daily
  function calcDaysLeft(remaining: number | null, daily: number | null): number | null {
    if (!remaining || !daily || daily <= 0) return null;
    return Math.floor(remaining / daily);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) {
      toast.error("Client wajib dipilih");
      return;
    }
    if (!form.ad_account_id.trim()) {
      toast.error("Ad Account ID wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        platform: form.platform,
        ad_account_id: form.ad_account_id.trim(),
        account_name: form.account_name.trim() || null,
        objective: form.objective.trim() || null,
        daily_budget: form.daily_budget ? parseFloat(form.daily_budget) : null,
        remaining_budget: form.remaining_budget ? parseFloat(form.remaining_budget) : null,
        days_left: calcDaysLeft(
          form.remaining_budget ? parseFloat(form.remaining_budget) : null,
          form.daily_budget ? parseFloat(form.daily_budget) : null
        ),
        status: form.status,
        notes: form.notes.trim() || null,
        pic_id: form.pic_id || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("ad_accounts")
          .update(payload as never)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Ad account diupdate!");
      } else {
        const { error } = await supabase.from("ad_accounts").insert(payload as never);
        if (error) throw error;
        toast.success("Ad account dibuat!");
      }

      setShowModal(false);
      loadAccounts();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSpend(e: React.FormEvent) {
    e.preventDefault();
    if (!spendAccountId) return;
    if (!spendForm.spend || parseFloat(spendForm.spend) <= 0) {
      toast.error("Spend harus lebih dari 0");
      return;
    }

    setSavingSpend(true);
    try {
      const payload = {
        ad_account_id: spendAccountId,
        log_date: spendForm.log_date,
        spend: parseFloat(spendForm.spend),
        impressions: spendForm.impressions ? parseInt(spendForm.impressions) : 0,
        clicks: spendForm.clicks ? parseInt(spendForm.clicks) : 0,
        conversions: spendForm.conversions ? parseFloat(spendForm.conversions) : 0,
        revenue: spendForm.revenue ? parseFloat(spendForm.revenue) : 0,
        notes: spendForm.notes.trim() || null,
      };

      const { error } = await supabase.from("ad_spend_logs").upsert(payload as never, {
        onConflict: "ad_account_id,log_date",
      });
      if (error) throw error;

      toast.success("Spend log disimpan! Budget auto-updated.");
      setShowSpendModal(false);
      loadSpendLogs();
      loadAccounts(); // Reload to get updated remaining_budget
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal simpan spend: " + msg);
    } finally {
      setSavingSpend(false);
    }
  }

  async function handleDeleteSpendLog(id: string) {
    if (!confirm("Hapus log ini?")) return;
    try {
      const { error } = await supabase.from("ad_spend_logs").delete().eq("id", id);
      if (error) throw error;
      toast.success("Log dihapus");
      loadSpendLogs();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus ad account ini?")) return;
    try {
      const { error } = await supabase.from("ad_accounts").delete().eq("id", id);
      if (error) throw error;
      toast.success("Ad account dihapus");
      loadAccounts();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleExportCSV() {
    if (filtered.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }
    const headers = [
      "Client",
      "Platform",
      "Ad Account ID",
      "Account Name",
      "Objective",
      "Daily Budget",
      "Remaining",
      "Days Left",
      "Status",
      "PIC",
      "Today Spend",
      "ROAS",
      "Notes",
    ];
    const today = new Date().toISOString().split("T")[0];
    const rows = filtered.map((a) => {
      const todayLog = spendLogs.filter(
        (l) => l.ad_account_id === a.id && l.log_date === today
      );
      const todaySpend = todayLog.reduce((s, l) => s + (l.spend || 0), 0);
      const revenue = todayLog.reduce((s, l) => s + (l.revenue || 0), 0);
      const roas = todaySpend > 0 ? (revenue / todaySpend).toFixed(2) : "0";
      return [
        a.client?.name || "",
        a.platform,
        a.ad_account_id,
        a.account_name || "",
        a.objective || "",
        a.daily_budget || 0,
        a.remaining_budget || 0,
        a.days_left || 0,
        a.status,
        a.pic?.full_name || "",
        todaySpend,
        roas,
        (a.notes || "").replace(/"/g, '""'),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ads-spend-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV diexport!");
  }

  // Recalculate days_left for all accounts (auto-calc)
  const accountsWithCalc = accounts.map((a) => ({
    ...a,
    days_left: calcDaysLeft(a.remaining_budget, a.daily_budget),
  }));

  const filtered = accountsWithCalc.filter((a) => {
    const matchSearch =
      !search ||
      a.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.ad_account_id.includes(search) ||
      a.account_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.pic?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchClient =
      clientFilter === "all" ||
      (clientFilter === "unassigned" ? !a.client_id : a.client_id === clientFilter);
    return matchSearch && matchStatus && matchClient;
  });

  // Trend chart data: aggregate spend & revenue by date
  const trendData: TrendData[] = useMemo(() => {
    const days = chartRange;
    const result: { [key: string]: { spend: number; revenue: number } } = {};

    // Initialize last N days
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      result[key] = { spend: 0, revenue: 0 };
    }

    // Aggregate spend logs
    const filteredAccountIds = new Set(filtered.map((a) => a.id));
    spendLogs.forEach((log) => {
      if (filteredAccountIds.has(log.ad_account_id) && result[log.log_date]) {
        result[log.log_date].spend += log.spend || 0;
        result[log.log_date].revenue += log.revenue || 0;
      }
    });

    return Object.entries(result).map(([date, val]) => ({
      date: new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
      spend: val.spend,
      revenue: val.revenue,
    }));
  }, [spendLogs, filtered, chartRange]);

  // Stats
  const totalDaily = accountsWithCalc
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);

  const totalRemaining = accountsWithCalc
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (a.remaining_budget || 0), 0);

  const lowBudgetCount = accountsWithCalc.filter(
    (a) => a.days_left !== null && a.days_left <= 3 && a.status === "active"
  ).length;

  const activeCount = accountsWithCalc.filter((a) => a.status === "active").length;
  const holdCount = accountsWithCalc.filter((a) => a.status === "hold").length;

  // Today's spend & ROAS
  const today = new Date().toISOString().split("T")[0];
  const todaySpend = spendLogs
    .filter((l) => l.log_date === today)
    .reduce((sum, l) => sum + (l.spend || 0), 0);
  const todayRevenue = spendLogs
    .filter((l) => l.log_date === today)
    .reduce((sum, l) => sum + (l.revenue || 0), 0);
  const todayROAS = todaySpend > 0 ? todayRevenue / todaySpend : 0;

  const metaBudget = accountsWithCalc
    .filter((a) => a.platform === "META" && a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);
  const googleBudget = accountsWithCalc
    .filter((a) => a.platform === "Google" && a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);
  const tiktokBudget = accountsWithCalc
    .filter((a) => a.platform === "TikTok" && a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);

  const statCards = [
    {
      label: "Total Daily Budget",
      value: formatIDR(totalDaily),
      sub: `${activeCount} active accounts`,
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Total Remaining",
      value: formatIDR(totalRemaining),
      sub: "active budgets",
      icon: TrendingDown,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Today's Spend",
      value: formatIDR(todaySpend),
      sub: `Revenue: ${formatIDR(todayRevenue)}`,
      icon: Activity,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Low Budget Alert",
      value: lowBudgetCount.toString(),
      sub: `ROAS today: ${todayROAS.toFixed(2)}x`,
      icon: AlertTriangle,
      color: lowBudgetCount > 0 ? "text-danger" : "text-muted",
      bg: lowBudgetCount > 0 ? "bg-danger/10" : "bg-surface",
    },
  ];

  const platformBreakdown = [
    { name: "META", budget: metaBudget, color: "bg-primary" },
    { name: "Google", budget: googleBudget, color: "bg-warning" },
    { name: "TikTok", budget: tiktokBudget, color: "bg-gray-900" },
  ];

  const { sortedData, sortState, toggleSort } = useSortable<AdAccount>({ data: filtered });

  const platformColors: Record<string, string> = {
    META: "bg-primary/20 text-primary",
    Google: "bg-warning/20 text-warning",
    TikTok: "bg-gray-900 text-white",
  };

  const statusColors: Record<string, string> = {
    active: "bg-success/20 text-success",
    inactive: "bg-surface text-muted",
    hold: "bg-warning/20 text-warning",
  };

  // Helper: get today's spend for an account
  function getTodaySpend(accountId: string): { spend: number; revenue: number; roas: number } {
    const logs = spendLogs.filter(
      (l) => l.ad_account_id === accountId && l.log_date === today
    );
    const spend = logs.reduce((s, l) => s + (l.spend || 0), 0);
    const revenue = logs.reduce((s, l) => s + (l.revenue || 0), 0);
    return { spend, revenue, roas: spend > 0 ? revenue / spend : 0 };
  }

  // Helper: get spend logs for modal
  const modalSpendLogs = spendLogs
    .filter((l) => l.ad_account_id === spendAccountId)
    .sort((a, b) => b.log_date.localeCompare(a.log_date))
    .slice(0, 14);

  const modalAccount = accounts.find((a) => a.id === spendAccountId);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Ads Spend Tracker</h1>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-4">
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ads Spend Tracker</h1>
          <p className="text-sm text-muted">
            Pantau budget, spending harian & ROAS semua ad account
          </p>
        </div>
          <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
            title="Import ad accounts dari Google Sheet"
          >
            <Download size={14} className="rotate-180" /> Import Sheet
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
          >
            <Download size={14} /> Export
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Ad Account
          </button>
        </div>
      </div>

      {/* Meta Connection Banner */}
      {metaConnection ? (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CheckCircle2 className="text-primary" size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Meta Ads Terhubung: {metaConnection.fb_user_name || "Facebook User"}
              </p>
              <p className="text-[11px] text-muted">
                {metaConnection.auto_sync ? "✅ Auto-sync aktif" : "⏸️ Auto-sync off"}
                {metaConnection.last_sync_at && (
                  <>
                    {" • "}
                    Sync terakhir:{" "}
                    {new Date(metaConnection.last_sync_at).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </>
                )}
                {metaConnection.last_sync_status === "error" && (
                  <span className="text-danger">
                    {" • "}
                    Error: {metaConnection.last_sync_error}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background disabled:opacity-50"
            >
              {syncing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Syncing...
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Sync Now
                </>
              )}
            </button>
            <button
              onClick={handleDisconnectMeta}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/5"
            >
              <Unlink size={14} /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Link2 className="text-primary" size={20} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Hubungkan Meta Ads Account</p>
              <p className="text-[11px] text-muted">
                Auto-sync spend harian dari Facebook/Meta Marketing API (tidak perlu input manual)
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => setShowTokenModal(true)}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
              title="Connect pakai token dari Graph API Explorer"
            >
              <KeyRound size={14} /> Manual Token
            </button>
            <a href="/api/meta/auth" className="btn-primary text-center">
              <Link2 size={14} /> Connect Meta (OAuth)
            </a>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{card.value}</p>
              <p className="mt-0.5 text-[10px] text-muted">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Platform Breakdown */}
      <div className="card p-4">
        <p className="mb-3 text-xs font-medium text-muted">
          BUDGET BREAKDOWN PER PLATFORM (Active)
        </p>
        <div className="space-y-2">
          {platformBreakdown.map((p) => {
            const pct = totalDaily > 0 ? (p.budget / totalDaily) * 100 : 0;
            return (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-16 text-xs font-medium text-gray-900">{p.name}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-background">
                  <div
                    className={cn(
                      "flex h-full items-center justify-end rounded-md px-2 text-[10px] font-medium text-white transition-all",
                      p.color
                    )}
                    style={{ width: `${Math.max(pct, p.budget > 0 ? 15 : 0)}%` }}
                  >
                    {p.budget > 0 && formatIDR(p.budget)}
                  </div>
                </div>
                <span className="w-10 text-right text-xs text-muted">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend Chart */}
      <div className="card p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <TrendingUp size={14} /> SPEND & REVENUE TREND
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              Total {filtered.length} accounts • {chartRange} hari terakhir
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setChartRange(7)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                chartRange === 7
                  ? "bg-primary text-white"
                  : "bg-background text-muted hover:text-gray-900"
              )}
            >
              7D
            </button>
            <button
              onClick={() => setChartRange(30)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                chartRange === 30
                  ? "bg-primary text-white"
                  : "bg-background text-muted hover:text-gray-900"
              )}
            >
              30D
            </button>
          </div>
        </div>
        {trendData.every((d) => d.spend === 0) ? (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <TrendingUp className="mb-2 text-muted" size={24} />
            <p className="text-xs text-muted">Belum ada data spend.</p>
            <p className="text-[10px] text-muted">
              Klik icon <ClipboardList size={10} className="inline" /> di tabel untuk log spend
              harian.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                interval={chartRange === 30 ? 3 : 0}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value: number) => formatIDR(value)}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#colorSpend)"
                name="Spend"
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {/* Legend */}
        <div className="mt-3 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-2 w-2 rounded-full bg-warning" /> Spend
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-2 w-2 rounded-full bg-success" /> Revenue
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client, ad account, atau PIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Client</option>
          <option value="unassigned">⚠️ Unassigned</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="hold">Hold</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Megaphone className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada ad account</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Tambah Ad Account
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr className="text-left text-xs uppercase text-muted">
                <SortableTh
                  label="Client"
                  sortKey="client.name"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Platform"
                  sortKey="platform"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="PIC"
                  sortKey="pic.full_name"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Daily"
                  sortKey="daily_budget"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Remaining"
                  sortKey="remaining_budget"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableTh
                  label="Days Left"
                  sortKey="days_left"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                  align="center"
                />
                <th className="px-4 py-3 text-right font-medium">Today Spend</th>
                <th className="px-4 py-3 text-center font-medium">ROAS</th>
                <SortableTh
                  label="Status"
                  sortKey="status"
                  activeKey={sortState.key}
                  direction={sortState.direction}
                  onSort={toggleSort}
                  align="center"
                />
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.map((a) => {
                const todayStats = getTodaySpend(a.id);
                return (
                  <tr key={a.id} className={cn("group hover:bg-surface/50", !a.client_id && "bg-warning/5")}>
                    <td className="px-4 py-3">
                      {a.client?.name ? (
                        <div className="font-medium text-gray-900">{a.client.name}</div>
                      ) : (
                        <div className="font-medium text-warning flex items-center gap-1">
                          <AlertTriangle size={12} /> Unassigned
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-muted">{a.ad_account_id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "badge",
                          platformColors[a.platform] || "bg-surface text-muted"
                        )}
                      >
                        {a.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.pic?.full_name ? (
                        <span className="flex items-center gap-1 text-xs text-gray-700">
                          <User size={12} className="text-muted" />
                          {a.pic.full_name}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatIDR(a.daily_budget)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatIDR(a.remaining_budget)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.days_left !== null && a.days_left <= 3 ? (
                        <span className="badge bg-danger/20 text-danger">
                          <AlertTriangle size={10} /> {a.days_left}d
                        </span>
                      ) : (
                        <span className="text-muted">
                          {a.days_left !== null ? `${a.days_left}d` : "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {a.platform === "META" && metaConnection ? (
                        <button
                          onClick={() => handleToggleSync(a.id, a.meta_sync_enabled || false)}
                          disabled={togglingId === a.id}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
                            a.meta_sync_enabled ? "bg-success" : "bg-gray-300"
                          )}
                          title={a.meta_sync_enabled ? "Auto-sync ON (klik untuk matikan)" : "Auto-sync OFF (klik untuk aktifkan)"}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                              a.meta_sync_enabled ? "translate-x-4" : "translate-x-1"
                            )}
                          />
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {todayStats.spend > 0 ? (
                        <span className="text-xs font-medium text-warning">
                          {formatIDR(todayStats.spend)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {todayStats.roas > 0 ? (
                        <span
                          className={cn(
                            "badge text-xs",
                            todayStats.roas >= 3
                              ? "bg-success/20 text-success"
                              : todayStats.roas >= 1
                                ? "bg-warning/20 text-warning"
                                : "bg-danger/20 text-danger"
                          )}
                        >
                          {todayStats.roas.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn("badge", statusColors[a.status] || statusColors.inactive)}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                        <button
                          onClick={() => openSpendLog(a.id)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-warning"
                          title="Log Spend Harian"
                        >
                          <ClipboardList size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(a)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                          title="Hapus"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Ad Account" : "Ad Account Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-3 rounded-lg bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">Client & Platform</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Client *
                    </label>
                    <select
                      required
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Platform *
                    </label>
                    <select
                      value={form.platform}
                      onChange={(e) => setForm({ ...form, platform: e.target.value })}
                      className="input"
                    >
                      <option value="META">META (FB/IG)</option>
                      <option value="Google">Google Ads</option>
                      <option value="TikTok">TikTok Ads</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Ad Account ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.ad_account_id}
                      onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })}
                      placeholder="1234567890"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Account Name
                    </label>
                    <input
                      type="text"
                      value={form.account_name}
                      onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                      placeholder="Nickname"
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">Budget & Status</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Daily Budget (Rp)
                    </label>
                    <input
                      type="number"
                      value={form.daily_budget}
                      onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                      placeholder="0"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">
                      Remaining (Rp)
                    </label>
                    <input
                      type="number"
                      value={form.remaining_budget}
                      onChange={(e) => setForm({ ...form, remaining_budget: e.target.value })}
                      placeholder="0"
                      className="input"
                    />
                  </div>
                </div>
                {form.daily_budget && form.remaining_budget && (
                  <p className="text-[10px] text-muted">
                    <TrendingDown size={10} className="mr-1 inline" />
                    Days left terhitung otomatis:{" "}
                    <strong>
                      {calcDaysLeft(
                        parseFloat(form.remaining_budget),
                        parseFloat(form.daily_budget)
                      )}{" "}
                      hari
                    </strong>
                  </p>
                )}
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="input"
                >
                  <option value="active">Active</option>
                  <option value="hold">Hold</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="space-y-3 rounded-lg bg-background p-3">
                <p className="text-xs font-semibold uppercase text-muted">PIC & Catatan</p>
                <select
                  value={form.pic_id}
                  onChange={(e) => setForm({ ...form, pic_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Tanpa PIC —</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || "Unknown"}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="Objective: Conversions, Traffic, Awareness..."
                  className="input"
                />
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                  className="input resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                    "Update Ad Account"
                  ) : (
                    "Simpan Ad Account"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Token Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Manual Token Connection</h2>
              <button
                onClick={() => setShowTokenModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-primary/5 p-3 text-xs text-gray-700">
              <p className="mb-2 font-semibold">📋 Cara dapatkan Access Token:</p>
              <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted">
                <li>
                  Buka{" "}
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  >
                    Graph API Explorer <ExternalLink size={10} />
                  </a>
                </li>
                <li>Pilih App Anda dari dropdown</li>
                <li>
                  Klik <strong>"Generate Access Token"</strong> → centang:{" "}
                  <code className="rounded bg-background px-1">ads_read</code>,{" "}
                  <code className="rounded bg-background px-1">ads_management</code>
                </li>
                <li>Copy token yang muncul, paste di bawah</li>
              </ol>
            </div>

            <form onSubmit={handleManualTokenSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Access Token *
                </label>
                <textarea
                  required
                  rows={4}
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="EAAGm0PX4ZCwBO..."
                  className="input font-mono text-[11px] resize-none"
                  disabled={savingToken}
                />
                <p className="mt-1 text-[10px] text-muted">
                  💡 Token akan otomatis di-exchange jadi long-lived (60 hari). Short-lived token
                  hanya berlaku ~1 jam.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
                >
                  Batal
                </button>
                <button type="submit" disabled={savingToken} className="btn-primary">
                  {savingToken ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menghubungkan...
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} /> Hubungkan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Sheet Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Import dari Google Sheet</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-primary/5 p-3 text-xs text-gray-700">
              <p className="mb-1 font-semibold">📋 Cara kerja:</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted">
                <li>Paste URL published Google Sheet (format pubhtml)</li>
                <li>Pilih kolom yang berisi nama ad account (default: E)</li>
                <li>Sistem akan parse dan import semua nama ke database</li>
                <li>Setelah import, klik "Sync Now" untuk match dengan Meta API</li>
              </ol>
            </div>

            <form onSubmit={handleImportSheet} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  URL Published Google Sheet *
                </label>
                <input
                  type="url"
                  required
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/e/..."
                  className="input text-[11px]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Kolom Ad Account Name
                </label>
                <select
                  value={sheetColumn}
                  onChange={(e) => setSheetColumn(e.target.value)}
                  className="input"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E (default)</option>
                  <option value="F">F</option>
                  <option value="G">G</option>
                </select>
                <p className="mt-1 text-[10px] text-muted">
                  Kolom mana yang berisi nama ad account di sheet Anda?
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
                >
                  Batal
                </button>
                <button type="submit" disabled={importing} className="btn-primary">
                  {importing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Importing...
                    </>
                  ) : (
                    <>
                      <Download size={14} className="rotate-180" /> Import Now
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Spend Log Modal */}
      {showSpendModal && modalAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Log Spend Harian</h2>
                <p className="text-xs text-muted">
                  {modalAccount.client?.name} • {modalAccount.platform} •{" "}
                  <span className="font-mono">{modalAccount.ad_account_id}</span>
                </p>
              </div>
              <button
                onClick={() => setShowSpendModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSpend} className="mb-4 space-y-3 rounded-lg bg-background p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={spendForm.log_date}
                    onChange={(e) => setSpendForm({ ...spendForm, log_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Spend (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    value={spendForm.spend}
                    onChange={(e) => setSpendForm({ ...spendForm, spend: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Impressions
                  </label>
                  <input
                    type="number"
                    value={spendForm.impressions}
                    onChange={(e) => setSpendForm({ ...spendForm, impressions: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Clicks</label>
                  <input
                    type="number"
                    value={spendForm.clicks}
                    onChange={(e) => setSpendForm({ ...spendForm, clicks: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Conversions
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={spendForm.conversions}
                    onChange={(e) =>
                      setSpendForm({ ...spendForm, conversions: e.target.value })
                    }
                    placeholder="0"
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Revenue / Value (Rp)
                </label>
                <input
                  type="number"
                  value={spendForm.revenue}
                  onChange={(e) => setSpendForm({ ...spendForm, revenue: e.target.value })}
                  placeholder="0"
                  className="input"
                />
                {spendForm.spend && spendForm.revenue && (
                  <p className="mt-1 text-[10px] text-muted">
                    ROAS:{" "}
                    <strong className={cn(parseFloat(spendForm.revenue) / parseFloat(spendForm.spend) >= 1 ? "text-success" : "text-danger")}>
                      {(parseFloat(spendForm.revenue) / parseFloat(spendForm.spend)).toFixed(2)}x
                    </strong>
                  </p>
                )}
              </div>
              <input
                type="text"
                value={spendForm.notes}
                onChange={(e) => setSpendForm({ ...spendForm, notes: e.target.value })}
                placeholder="Catatan (opsional)"
                className="input"
              />
              <div className="flex justify-end">
                <button type="submit" disabled={savingSpend} className="btn-primary">
                  {savingSpend ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    "Simpan Log"
                  )}
                </button>
              </div>
            </form>

            {/* History */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Riwayat (14 hari)</p>
              {modalSpendLogs.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">Belum ada log spend</p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {modalSpendLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-gray-900">
                          {new Date(log.log_date).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <span className="ml-2 text-muted">
                          {log.impressions > 0 && `${log.impressions.toLocaleString()} imp • `}
                          {log.clicks > 0 && `${log.clicks.toLocaleString()} click • `}
                          {log.revenue > 0 &&
                            `Rev: ${formatIDR(log.revenue)} • `}
                          {log.spend > 0 &&
                            log.revenue > 0 &&
                            `ROAS: ${(log.revenue / log.spend).toFixed(2)}x`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-warning">
                          {formatIDR(log.spend)}
                        </span>
                        <button
                          onClick={() => handleDeleteSpendLog(log.id)}
                          className="text-muted hover:text-danger"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-md bg-primary/5 p-3 text-[10px] text-muted">
              💡 <strong>Auto-update:</strong> Saat spend log disimpan, remaining budget ad account
              akan otomatis berkurang sesuai spend hari ini.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}