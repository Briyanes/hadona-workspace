"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo, useRef } from "react";
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
import { useShiftSelect } from "@/hooks/use-shift-select";
import { SortableTh } from "@/components/ui/sortable-th";
import {
  type AdAccount,
  type SpendLog,
  type ClientOption as Client,
  type TeamMember,
  type MetaConnection,
  type TrendData,
  type AdAccountForm,
  type SpendForm,
  type AssignResult,
  emptyAdAccountForm as emptyForm,
  emptySpendForm,
  calcDaysLeft,
} from "@/components/ads-spend/types";
import { AdAccountModal } from "@/components/ads-spend/ad-account-modal";
import { ManualTokenModal } from "@/components/ads-spend/manual-token-modal";
import { ImportSheetModal } from "@/components/ads-spend/import-sheet-modal";
import { SpendLogModal } from "@/components/ads-spend/spend-log-modal";

export default function AdsSpendPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [spendLogs, setSpendLogs] = useState<SpendLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // FASE 4: Debounced search untuk performance (hindari re-filter setiap ketik)
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input (300ms delay)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [picFilter, setPicFilter] = useState("all");
  // Pagination (performance untuk 100+ akun)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [showBudgetAlert, setShowBudgetAlert] = useState(true);

  // Bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkClientId, setBulkClientId] = useState("");
  const [bulkDailyBudget, setBulkDailyBudget] = useState("");
  const [bulkRemaining, setBulkRemaining] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
  const [importMode, setImportMode] = useState<"assign" | "import">("assign");
  const [sheetUrl, setSheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrMQ3VuFWBGtfbf8P-EV2kGEv6GB2UnCqXSgUNiNh4aTXEQD7mECzrnnWsAeF7rllx6dOCIpKImTLR/pubhtml"
  );
  const [sheetColumn, setSheetColumn] = useState("E");
  const [clientColumn, setClientColumn] = useState("B");
  const [accountColumn, setAccountColumn] = useState("F");
  const [importing, setImporting] = useState(false);

  // Auto-assign results
  const [assignResult, setAssignResult] = useState<AssignResult | null>(null);

  useEffect(() => {
    loadAccounts();
    loadClients();
    loadTeam();
    loadSpendLogs();
    loadMetaConnection();
    checkUrlParams();
  }, []);

  // BUG FIX: Clear selection saat filter/search berubah (hindari bulk delete akun yang tidak terlihat)
  // FASE 2: Reset halaman juga saat filter berubah
  useEffect(() => {
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, clientFilter, picFilter]);

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta_connected")) {
      const linked = params.get("meta_linked");
      const needsUpgrade = params.get("token_needs_upgrade");

      if (needsUpgrade) {
        toast.warning(
          "Meta terhubung, tetapi token TIDAK memiliki akses ad account (scope ads_read). Gunakan 'Connect dengan Token' → System User Token untuk auto-sync spend.",
          { duration: 10000 }
        );
      } else {
        const msg = linked
          ? `Meta terhubung! ${linked} ad account otomatis di-link & auto-sync diaktifkan.`
          : "Meta account berhasil terhubung!";
        toast.success(msg);
      }
      window.history.replaceState({}, "", "/ads-spend");
    }
    const metaError = params.get("meta_error");
    if (metaError) {
      const errorMessages: Record<string, string> = {
        not_configured: "Meta App belum dikonfigurasi. Hubungi admin untuk set META_APP_ID & META_APP_SECRET.",
        auth_failed: "OAuth gagal. Pastikan App sudah dalam Live Mode di Meta Dashboard.",
        permission_denied: "Anda menolak izin akses Meta. Coba connect ulang.",
        missing_params: "Parameter tidak lengkap. Coba connect ulang.",
        state_mismatch: "Sesi tidak valid. Coba connect ulang.",
        db_error: "Gagal menyimpan koneksi ke database.",
      };
      const msg = errorMessages[metaError] || `Meta Error: ${metaError.replace(/_/g, " ")}`;
      toast.error(msg);
      window.history.replaceState({}, "", "/ads-spend");
    }
  }

  async function handleToggleSync(accountId: string, currentEnabled: boolean) {
    setTogglingId(accountId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "toggle-sync",
          accountId,
          enabled: !currentEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal toggle sync");

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

    // Route to auto-assign if in assign mode
    if (importMode === "assign") {
      return handleAutoAssign();
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

  async function handleAutoAssign() {
    if (!sheetUrl.trim()) {
      toast.error("URL Sheet wajib diisi");
      return;
    }

    setImporting(true);
    setAssignResult(null);
    try {
      const res = await fetch("/api/import/assign-from-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          clientColumn: clientColumn,
          accountColumn: accountColumn,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Auto-assign gagal");

      setAssignResult({
        matched: data.matched || 0,
        clients_created: data.clients_created || 0,
        already_assigned: data.already_assigned || 0,
        duplicates: data.duplicates || 0,
        no_match: data.no_match || 0,
        matched_details: data.matched_details || [],
        no_match_details: data.no_match_details || [],
      });

      const parts: string[] = [];
      if (data.matched > 0) parts.push(`✅ ${data.matched} di-assign`);
      if (data.clients_created > 0) parts.push(`✨ ${data.clients_created} client baru`);
      if (data.already_assigned > 0) parts.push(`⏭️ ${data.already_assigned} sudah sesuai`);
      if (data.no_match > 0) parts.push(`⚠️ ${data.no_match} tidak match`);

      toast.success(`Auto-assign selesai! ${parts.join(" • ")}`, { duration: 8000 });

      loadAccounts();
      loadClients();
    } catch (err) {
      toast.error("Gagal auto-assign: " + extractError(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleDisconnectMeta() {
    if (!metaConnection) return;
    if (!confirm("Putuskan koneksi Meta? Anda perlu connect ulang untuk sync otomatis.")) return;

    try {
      // BUG FIX: Supabase update() doesn't throw on RLS failure — must check { error }
      const { error } = await supabase
        .from("meta_connections")
        .update({ is_active: false, auto_sync: false } as never)
        .eq("id", metaConnection.id);

      if (error) throw new Error(error.message);

      toast.success("Koneksi Meta diputus");
      setMetaConnection(null);
    } catch (err) {
      toast.error("Gagal disconnect: " + extractError(err));
    }
  }

  async function loadAccounts() {
    try {
      // Try full query with joins (requires migration v10+)
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, client:clients(name), pic:profiles!pic_id(full_name)")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts((data as unknown as AdAccount[]) || []);
    } catch (err) {
      const msg = extractError(err);

      // Fallback: try basic query without joins (if pic_id column doesn't exist yet)
      try {
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from("ad_accounts")
          .select("*")
          .order("created_at", { ascending: false });

        if (fallbackErr) throw fallbackErr;

        const basicAccounts = (fallbackData as unknown as AdAccount[]) || [];

        // Manually fetch client names for basic accounts
        if (basicAccounts.length > 0) {
          const clientIds = Array.from(new Set(basicAccounts.map((a) => a.client_id).filter(Boolean)));
          if (clientIds.length > 0) {
            const { data: clientsData } = await supabase
              .from("clients")
              .select("id, name")
              .in("id", clientIds);
            const clientMap = new Map(
              (clientsData || []).map((c: { id: string; name: string }) => [c.id, c.name])
            );
            basicAccounts.forEach((a) => {
              if (a.client_id) {
                a.client = { name: clientMap.get(a.client_id) || "Unknown" };
              }
            });
          }
        }

        setAccounts(basicAccounts);
        toast.warning(
          "Database belum lengkap. Jalankan migration v10-v14 di Supabase SQL Editor untuk fitur penuh.",
          { duration: 10000 }
        );
      } catch (err2) {
        const msg2 = extractError(err2);
        setError("Gagal memuat data: " + msg2);
        toast.error("Gagal memuat ad accounts: " + msg2);
      }
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
      const msg = extractError(err);
      console.warn("Spend logs not loaded:", msg);
      toast.warning("Data spend log gagal dimuat. Chart & Today Spend mungkin kosong.", {
        duration: 6000,
      });
    }
  }

  async function loadClients() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/clients", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load clients");
      const json = await res.json();
      setClients((json.clients as Client[]) || []);
    } catch (err) {
      console.error("Failed to load clients:", extractError(err));
      setClients([]);
    }
  }

  async function loadTeam() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/team", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load team");
      const json = await res.json();
      setTeam((json.team as TeamMember[]) || []);
    } catch (err) {
      console.error("Failed to load team:", extractError(err));
      setTeam([]);
    }
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

      // Use API route (service role key bypasses RLS)
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "save", payload, editingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");

      toast.success(editingId ? "Ad account diupdate!" : "Ad account dibuat!");
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

      // Use API route (service role key bypasses RLS)
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "save-spend", payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan spend");

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
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "delete-spend", logId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus log");

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
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "delete", accountId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus ad account");

      toast.success("Ad account dihapus");
      loadAccounts();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  // clearSelection akan didefinisikan setelah hook useShiftSelect (di bawah)

  async function handleBulkAssign() {
    if (selectedIds.size === 0) {
      toast.error("Pilih minimal 1 akun");
      return;
    }
    if (!bulkClientId) {
      toast.error("Pilih client untuk assign");
      return;
    }

    setBulkSaving(true);
    try {
      // Use API route (service role key bypasses RLS)
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "bulk-assign",
          accountIds: Array.from(selectedIds),
          clientId: bulkClientId,
          dailyBudget: bulkDailyBudget || undefined,
          remainingBudget: bulkRemaining || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal bulk assign");

      toast.success(`✅ ${data.updated || selectedIds.size} akun berhasil di-assign!`, { duration: 5000 });
      clearSelection();
      loadAccounts();
    } catch (err) {
      toast.error("Gagal bulk assign: " + extractError(err));
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      toast.error("Pilih minimal 1 akun");
      return;
    }

    const count = selectedIds.size;
    const confirmed = window.confirm(
      `⚠️ Hapus ${count} ad account?\n\nTindakan ini tidak bisa dibatalkan. Semua data spend log terkait juga akan dihapus.`
    );
    if (!confirmed) return;

    // Double confirmation for safety
    const confirmed2 = window.confirm(
      `Konfirmasi terakhir: Yakin hapus ${count} akun permanen?`
    );
    if (!confirmed2) return;

    setBulkDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/ad-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "bulk-delete",
          accountIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal bulk delete");

      toast.success(`🗑️ ${data.deleted || count} akun berhasil dihapus!`, { duration: 5000 });
      clearSelection();
      loadAccounts();
      loadSpendLogs();
    } catch (err) {
      toast.error("Gagal hapus: " + extractError(err));
    } finally {
      setBulkDeleting(false);
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
      "Today Revenue",
      "ROAS",
      "Impressions",
      "Clicks",
      "CTR (%)",
      "CPC",
      "CPM",
      "Conversions",
      "Pacing (%)",
      "Notes",
    ];
    const today = new Date().toISOString().split("T")[0];
    const rows = filtered.map((a) => {
      const todayLog = spendLogs.filter(
        (l) => l.ad_account_id === a.id && l.log_date === today
      );
      const todaySpend = todayLog.reduce((s, l) => s + (l.spend || 0), 0);
      const revenue = todayLog.reduce((s, l) => s + (l.revenue || 0), 0);
      const impressions = todayLog.reduce((s, l) => s + (l.impressions || 0), 0);
      const clicks = todayLog.reduce((s, l) => s + (l.clicks || 0), 0);
      const conversions = todayLog.reduce((s, l) => s + (l.conversions || 0), 0);
      const roas = todaySpend > 0 ? (revenue / todaySpend).toFixed(2) : "0";
      const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0";
      const cpc = clicks > 0 ? (todaySpend / clicks).toFixed(0) : "0";
      const cpm = impressions > 0 ? ((todaySpend / impressions) * 1000).toFixed(0) : "0";
      const last30Spend = spendLogs
        .filter((l) => l.ad_account_id === a.id)
        .reduce((s, l) => s + (l.spend || 0), 0);
      const monthlyBudget = (a.daily_budget || 0) * 30;
      const pacing = monthlyBudget > 0 ? ((last30Spend / monthlyBudget) * 100).toFixed(0) : "0";
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
        revenue,
        roas,
        impressions,
        clicks,
        ctr,
        cpc,
        cpm,
        conversions,
        pacing,
        (a.notes || "").replace(/"/g, '""'),
      ];
    });
    // BUG FIX: Hanya quote cell yang mengandung koma/quote/newline; angka biarkan plain
    // supaya Excel/Sheets mengenali sebagai number (bisa di-SUM)
    const escapeCell = (c: string | number): string => {
      const s = String(c);
      if (/["\n,]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const csv = [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\n");
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

  // FASE 4: Pakai debouncedSearch untuk filter (bukan search langsung)
  const filtered = accountsWithCalc.filter((a) => {
    const q = debouncedSearch.toLowerCase();
    const matchSearch =
      !debouncedSearch ||
      a.client?.name?.toLowerCase().includes(q) ||
      a.ad_account_id.includes(debouncedSearch) ||
      a.account_name?.toLowerCase().includes(q) ||
      a.pic?.full_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchClient =
      clientFilter === "all" ||
      (clientFilter === "unassigned" ? !a.client_id : a.client_id === clientFilter);
    // FASE 2: Filter by PIC
    const matchPic =
      picFilter === "all" ||
      (picFilter === "unassigned" ? !a.pic_id : a.pic_id === picFilter);
    return matchSearch && matchStatus && matchClient && matchPic;
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

  // FASE 2: Pagination untuk performance (100+ akun)
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // ─── Shift+Click Range Selection ───
  const { onRowToggle, onHeaderToggle, clearSelection: clearShiftSelection } =
    useShiftSelect<AdAccount>({
      data: sortedData,
      getId: (a) => a.id,
      selectedIds,
      setSelectedIds,
    });

  function clearSelection() {
    clearShiftSelection();
    setShowBulkAssign(false);
    setBulkClientId("");
    setBulkDailyBudget("");
    setBulkRemaining("");
  }

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
  // FASE 3: Include impressions, clicks, CTR, CPC, CPM untuk advertising depth
  function getTodaySpend(accountId: string): {
    spend: number;
    revenue: number;
    roas: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    cpm: number;
  } {
    const logs = spendLogs.filter(
      (l) => l.ad_account_id === accountId && l.log_date === today
    );
    const spend = logs.reduce((s, l) => s + (l.spend || 0), 0);
    const revenue = logs.reduce((s, l) => s + (l.revenue || 0), 0);
    const impressions = logs.reduce((s, l) => s + (l.impressions || 0), 0);
    const clicks = logs.reduce((s, l) => s + (l.clicks || 0), 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    return { spend, revenue, roas: spend > 0 ? revenue / spend : 0, impressions, clicks, ctr, cpc, cpm };
  }

  // FASE 3: Budget Pacing (% budget terpakai dari total = daily * 30 hari asumsi bulanan)
  function getBudgetPacing(account: AdAccount): { pct: number; status: "on_track" | "over" | "under" } {
    if (!account.daily_budget || account.daily_budget <= 0) return { pct: 0, status: "on_track" };
    // Hitung total spend 30 hari terakhir untuk akun ini
    const last30Spend = spendLogs
      .filter((l) => l.ad_account_id === account.id)
      .reduce((s, l) => s + (l.spend || 0), 0);
    const monthlyBudget = account.daily_budget * 30;
    const pct = monthlyBudget > 0 ? (last30Spend / monthlyBudget) * 100 : 0;
    const status = pct > 110 ? "over" : pct < 60 ? "under" : "on_track";
    return { pct, status };
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Ads Spend Tracker</h1>
          <p className="text-sm text-muted">
            Pantau budget, spending harian & ROAS semua ad account
          </p>
        </div>
          <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center rounded-md border border-border bg-surface px-2.5 py-2 text-gray-700 transition-colors hover:bg-background"
            title="Import Sheet"
          >
            <Download size={14} className="rotate-180" />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center rounded-md border border-border bg-surface px-2.5 py-2 text-gray-700 transition-colors hover:bg-background"
            title="Export"
          >
            <Download size={14} />
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Ad Account
          </button>
        </div>
      </div>

      {/* Meta Connection Banner */}
      {metaConnection ? (
        (() => {
          // FIX B4: Determine token status for UI display
          // SMART CHECK: Only disable sync if token has ACTUALLY expired.
          // If token_expires_at is in the future, allow retry even if previous sync failed.
          const tokenActuallyExpired = metaConnection.token_expires_at &&
            new Date(metaConnection.token_expires_at) <= new Date();
          // For System User tokens (no expiry), never mark as permanently invalid
          const isSystemUserToken = !metaConnection.token_expires_at;
          // Only truly invalid if: token expired OR System User with explicit invalid status
          const isTokenInvalid = tokenActuallyExpired ||
            (isSystemUserToken && metaConnection.token_status === "invalid");
          // Show warning (but still allow sync) if previous sync failed but token hasn't expired
          const hasSyncError = !isTokenInvalid &&
            (metaConnection.token_status === "invalid" || metaConnection.last_sync_status === "token_invalid");
          const isTokenExpiring =
            (metaConnection.token_expires_at &&
             new Date(metaConnection.token_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
             new Date(metaConnection.token_expires_at) > new Date());
          
          const statusIcon = isTokenInvalid ? AlertCircle : isTokenExpiring ? AlertTriangle : CheckCircle2;
          const StatusIcon = statusIcon;
          const iconColor = isTokenInvalid ? "text-danger" : isTokenExpiring ? "text-warning" : "text-primary";
          const iconBg = isTokenInvalid ? "bg-danger/10" : isTokenExpiring ? "bg-warning/10" : "bg-primary/10";

          return (
            <div className={cn(
              "card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
              isTokenInvalid && "border-danger/30 bg-danger/5"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
                  <StatusIcon className={iconColor} size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Meta Ads Terhubung: {metaConnection.fb_user_name || "Facebook User"}
                    {isTokenInvalid && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">
                        ⚠️ TOKEN INVALID
                      </span>
                    )}
                    {isTokenExpiring && !isTokenInvalid && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                        ⏰ EXPIRING SOON
                      </span>
                    )}
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
                    {metaConnection.token_expires_at && (
                      <>
                        {" • "}
                        Token exp:{" "}
                        <span className={isTokenInvalid ? "text-danger font-medium" : isTokenExpiring ? "text-warning font-medium" : ""}>
                          {new Date(metaConnection.token_expires_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </>
                    )}
                    {(metaConnection.last_sync_status === "error" || metaConnection.last_sync_status === "token_invalid") && metaConnection.last_sync_error && (
                      <span className="text-danger block mt-0.5">
                        ❌ {metaConnection.last_sync_error}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {isTokenInvalid && (
                  <button
                    onClick={() => setShowTokenModal(true)}
                    className="flex items-center gap-1.5 rounded-md bg-danger px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-danger/90"
                  >
                    <KeyRound size={14} /> Reconnect dengan Token
                  </button>
                )}
                <button
                  onClick={handleSyncNow}
                  disabled={syncing || isTokenInvalid}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background disabled:opacity-50"
                  title={isTokenInvalid ? "Token invalid — reconnect dulu" : undefined}
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
          );
        })()
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
            <a href="/api/meta/auth" className="btn-primary" title="Login dengan Facebook — otomatis sinkron ad accounts Anda">
              <Link2 size={14} /> Connect dengan Facebook ⭐
            </a>
            <button
              onClick={() => setShowTokenModal(true)}
              className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background"
              title="Connect pakai System User Token — permanent, alternatif jika OAuth tidak memungkinkan"
            >
              <KeyRound size={14} /> Connect dengan Token
            </button>
          </div>
        </div>
      )}

      {/* FASE 2: Budget Alert Banner */}
      {showBudgetAlert && lowBudgetCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={18} />
          <div className="flex-1">
            <p className="text-sm font-medium text-danger">
              ⚠️ {lowBudgetCount} akun budget menipis (≤ 3 hari)!
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Gunakan filter status "Active" untuk melihat akun yang perlu top-up. Klik akun di tabel untuk detail budget.
            </p>
          </div>
          <button
            onClick={() => setShowBudgetAlert(false)}
            className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
            title="Tutup banner"
          >
            <X size={14} />
          </button>
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
        {/* FASE 2: Filter by PIC */}
        <select
          value={picFilter}
          onChange={(e) => setPicFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua PIC</option>
          <option value="unassigned">⚠️ Tanpa PIC</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name || "Unknown"}
            </option>
          ))}
        </select>
      </div>

      {/* Floating Bulk Assign Toolbar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto flex max-w-3xl flex-col gap-3 rounded-lg border border-primary/30 bg-surface p-3 shadow-xl sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="badge bg-primary/20 text-primary">✓ {selectedIds.size} dipilih</span>
            <button
              onClick={clearSelection}
              className="text-xs text-muted hover:text-danger"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            <select
              value={bulkClientId}
              onChange={(e) => setBulkClientId(e.target.value)}
              className="input min-w-[140px] flex-1 text-xs"
            >
              <option value="">— Pilih Client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              value={bulkDailyBudget}
              onChange={(e) => setBulkDailyBudget(e.target.value)}
              placeholder="Daily (opsional)"
              className="input w-28 text-xs"
            />
            <input
              type="number"
              value={bulkRemaining}
              onChange={(e) => setBulkRemaining(e.target.value)}
              placeholder="Remaining (opsional)"
              className="input w-32 text-xs"
            />
            <button
              onClick={handleBulkAssign}
              disabled={bulkSaving || !bulkClientId}
              className="btn-primary whitespace-nowrap text-xs"
            >
              {bulkSaving ? (
                <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
              ) : (
                <>Assign ({selectedIds.size})</>
              )}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
              title="Hapus akun terpilih permanen"
            >
              {bulkDeleting ? (
                <><Loader2 size={14} className="animate-spin" /> Menghapus...</>
              ) : (
                <><Trash2 size={14} /> Delete ({selectedIds.size})</>
              )}
            </button>
          </div>
        </div>
      )}

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
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={onHeaderToggle}
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
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
                <th className="px-4 py-3 text-center font-medium" title="Auto-sync Meta">Sync</th>
                {/* FASE 3: Kolom CTR, CPC, Pacing untuk advertising depth */}
                <th className="px-4 py-3 text-center font-medium" title="Click-Through Rate">CTR</th>
                <th className="px-4 py-3 text-center font-medium" title="Cost Per Click">CPC</th>
                <th className="px-4 py-3 text-center font-medium" title="Budget Pacing (30 hari)">Pacing</th>
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
              {paginatedData.map((a, displayIndex) => {
                const index = (currentPage - 1) * pageSize + displayIndex;
                const todayStats = getTodaySpend(a.id);
                return (
                  <tr key={a.id} className={cn("group hover:bg-surface/50", !a.client_id && "bg-warning/5")}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onClick={(e) => onRowToggle(a.id, index, e)}
                        onChange={() => {}}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {a.client?.name ? (
                        <div className="font-medium text-gray-900">{a.client.name}</div>
                      ) : (
                        <div className="font-medium text-warning flex items-center gap-1">
                          <AlertTriangle size={12} /> Unassigned
                        </div>
                      )}
                      {a.account_name ? (
                        <div className="text-[10px] text-gray-600">{a.account_name}</div>
                      ) : null}
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
                      {/* BUG FIX: Handle days_left <= 0 (budget habis) */}
                      {a.days_left !== null && a.days_left <= 0 ? (
                        <span className="badge bg-danger/20 text-danger animate-pulse" title="Budget habis!">
                          <AlertTriangle size={10} /> Habis
                        </span>
                      ) : a.days_left !== null && a.days_left <= 3 ? (
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
                    {/* FASE 3: CTR */}
                    <td className="px-4 py-3 text-center">
                      {todayStats.ctr > 0 ? (
                        <span className={cn(
                          "text-xs font-medium",
                          todayStats.ctr >= 2 ? "text-success" : todayStats.ctr >= 1 ? "text-warning" : "text-danger"
                        )} title={`${todayStats.clicks} clicks / ${todayStats.impressions} impressions`}>
                          {todayStats.ctr.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* FASE 3: CPC */}
                    <td className="px-4 py-3 text-center">
                      {todayStats.cpc > 0 ? (
                        <span className="text-xs text-gray-700">
                          {formatIDR(todayStats.cpc)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {/* FASE 3: Budget Pacing */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const pacing = getBudgetPacing(a);
                        if (pacing.pct === 0) return <span className="text-muted">—</span>;
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={cn(
                              "text-[10px] font-bold",
                              pacing.status === "over" ? "text-danger" : pacing.status === "under" ? "text-warning" : "text-success"
                            )}>
                              {pacing.pct.toFixed(0)}%
                            </span>
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-background" title={`${pacing.pct.toFixed(0)}% dari monthly budget (${formatIDR(a.daily_budget! * 30)})`}>
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  pacing.status === "over" ? "bg-danger" : pacing.status === "under" ? "bg-warning" : "bg-success"
                                )}
                                style={{ width: `${Math.min(pacing.pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
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

      {/* FASE 2: Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            Menampilkan {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, sortedData.length)} dari {sortedData.length} akun
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-background disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="text-xs font-medium text-gray-900">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-background disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AdAccountModal
        open={showModal}
        onClose={() => setShowModal(false)}
        form={form}
        setForm={setForm}
        onSubmit={handleSave}
        saving={saving}
        editingId={editingId}
        clients={clients}
        team={team}
      />

      {/* Manual Token Modal */}
      <ManualTokenModal
        open={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        manualToken={manualToken}
        setManualToken={setManualToken}
        onSubmit={handleManualTokenSubmit}
        savingToken={savingToken}
      />

      {/* Import Sheet Modal */}
      <ImportSheetModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        importMode={importMode}
        setImportMode={setImportMode}
        sheetUrl={sheetUrl}
        setSheetUrl={setSheetUrl}
        clientColumn={clientColumn}
        setClientColumn={setClientColumn}
        accountColumn={accountColumn}
        setAccountColumn={setAccountColumn}
        sheetColumn={sheetColumn}
        setSheetColumn={setSheetColumn}
        assignResult={assignResult}
        setAssignResult={setAssignResult}
        onSubmit={handleImportSheet}
        importing={importing}
      />

      {/* Spend Log Modal */}
      <SpendLogModal
        open={showSpendModal}
        onClose={() => setShowSpendModal(false)}
        modalAccount={modalAccount || null}
        spendForm={spendForm}
        setSpendForm={setSpendForm}
        onSubmit={handleSaveSpend}
        savingSpend={savingSpend}
        modalSpendLogs={modalSpendLogs}
        onDeleteLog={handleDeleteSpendLog}
      />
    </div>
  );
}
