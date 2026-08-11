"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Building2,
  Plus,
  X,
  Pencil,
  Trash2,
  AlertCircle,
  Phone,
  Mail,
  Loader2,
  LayoutGrid,
  List,
  Filter,
  CheckCircle,
  Clock,
  PauseCircle,
  DollarSign,
  Wallet,
  TrendingUp,
  AlertTriangle,
  User,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { cn, formatIDR, getInitials } from "@/lib/utils";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { uploadFile } from "@/lib/upload";
import { ImagePlus } from "lucide-react";

interface Client {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  status: string;
  services: string[];
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  contract_value: number | null;
  contract_start: string | null;
  contract_end: string | null;
  account_manager_id: string | null;
  logo_url: string | null;
  // Financial data from view
  real_mrr: number;
  outstanding: number;
  paid_this_month: number;
  overdue_count: number;
  // AM name via join
  am_name?: string | null;
}

interface AccountManager {
  id: string;
  full_name: string;
}

const SERVICE_OPTIONS = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "SEO",
  "Content",
  "Social Media",
  "Web Dev",
  "Branding",
];

const STATUS_OPTIONS = ["active", "onboarding", "hold", "inactive", "churned"];

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success",
  inactive: "bg-surface text-muted",
  hold: "bg-warning/20 text-warning",
  onboarding: "bg-primary/20 text-primary",
  churned: "bg-danger/20 text-danger",
};

const emptyForm = {
  name: "",
  industry: "",
  status: "active",
  services: [] as string[],
  contact_person: "",
  contact_phone: "",
  contact_email: "",
  notes: "",
  contract_value: "",
  contract_start: "",
  contract_end: "",
  account_manager_id: "",
  logo_url: "",
};

export default function ClientsPage() {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // View & filter state
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  // 🆕 Default filter = "active" — user request: filter utama client yang active
  // Override per request: tampilkan active client sebagai default view.
  // Quick Status Chips (di bawah) memungkinkan user switch ke status lain dengan 1 klik.
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterService, setFilterService] = useState("all");
  const [filterAM, setFilterAM] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // 🆕 Pagination state (Load More pattern — sama dengan reports page)
  // Default 12 cards. +12 setiap klik Load More. Reset ke 12 saat filter/search/sort berubah.
  // Performance: hindari render semua client sekaligus kalau dataset tumbuh.
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [accountManagers, setAccountManagers] = useState<AccountManager[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    loadClients();
    loadAccountManagers();
  }, []);

  // ============================================
  // Load: Clients + Financial Summary (joined)
  // ============================================
  async function loadClients() {
    try {
      // Load clients with AM join
      const { data: clientData, error } = await supabase
        .from("clients")
        .select("*, am:profiles!account_manager_id(full_name)")
        .order("name");

      if (error) throw error;
      const clientList = (clientData as unknown as Client[]) || [];

      // Load financial summary from the view
      let financialMap: Record<string, { real_mrr: number; outstanding: number; paid_this_month: number; overdue_count: number }> = {};

      try {
        const { data: finData, error: finError } = await supabase
          .from("client_financial_summary")
          .select("client_id, real_mrr, outstanding, paid_this_month, overdue_count");

        if (!finError && finData) {
          for (const row of finData as unknown as { client_id: string; real_mrr: number; outstanding: number; paid_this_month: number; overdue_count: number }[]) {
            financialMap[row.client_id] = {
              real_mrr: Number(row.real_mrr) || 0,
              outstanding: Number(row.outstanding) || 0,
              paid_this_month: Number(row.paid_this_month) || 0,
              overdue_count: Number(row.overdue_count) || 0,
            };
          }
        }
      } catch {
        // View might not exist yet — fallback to contract_value
        console.warn("client_financial_summary view not available, using fallback");
      }

      // Merge financial data into clients
      const mergedClients = clientList.map((c) => {
        const fin = financialMap[c.id];
        const amData = c as unknown as { am?: { full_name: string } | null };
        return {
          ...c,
          real_mrr: fin?.real_mrr ?? (Number(c.contract_value) || 0),
          outstanding: fin?.outstanding ?? 0,
          paid_this_month: fin?.paid_this_month ?? 0,
          overdue_count: fin?.overdue_count ?? 0,
          am_name: amData.am?.full_name ?? null,
        };
      });

      setClients(mergedClients);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat data client: " + msg);
      toast.error("Gagal memuat data client");
    } finally {
      setLoading(false);
    }
  }

  async function loadAccountManagers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name");
    if (!error && data) {
      setAccountManagers(data as unknown as AccountManager[]);
    }
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(client: Client) {
    setForm({
      name: client.name,
      industry: client.industry || "",
      status: client.status,
      services: client.services || [],
      contact_person: client.contact_person || "",
      contact_phone: client.contact_phone || "",
      contact_email: client.contact_email || "",
      notes: client.notes || "",
      contract_value: client.contract_value ? String(client.contract_value) : "",
      contract_start: client.contract_start || "",
      contract_end: client.contract_end || "",
      account_manager_id: client.account_manager_id || "",
      logo_url: client.logo_url || "",
    });
    setEditingId(client.id);
    setShowModal(true);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran logo maksimal 2MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const { publicUrl } = await uploadFile(file, "client-logos");
      setForm((prev) => ({ ...prev, logo_url: publicUrl }));
      toast.success("Logo berhasil diupload");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal upload logo: " + msg);
    } finally {
      setUploadingLogo(false);
    }
  }

  function toggleService(service: string) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Nama client wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: slugify(form.name),
        industry: form.industry.trim() || null,
        status: form.status,
        services: form.services,
        contact_person: form.contact_person.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        notes: form.notes.trim() || null,
        contract_value: form.contract_value ? parseFloat(form.contract_value) : 0,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        account_manager_id: form.account_manager_id || null,
        logo_url: form.logo_url || null,
      };

      if (editingId) {
        const { error } = await supabase.from("clients").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("Client berhasil diupdate!");
      } else {
        const { error } = await supabase.from("clients").insert(payload as never);
        if (error) throw error;
        toast.success("Client berhasil dibuat!");
      }

      setShowModal(false);
      loadClients();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      console.error("[Client Save Error]", err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus client "${name}"? Tugas terkait akan kehilangan referensi client.`)) return;
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      toast.success("Client dihapus");
      loadClients();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      console.error("[Client Delete Error]", err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  // ============================================
  // Filtered data
  // ============================================
  const filtered = clients.filter(
    (c) =>
      (!search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.industry?.toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "all" || c.status === filterStatus) &&
      (filterService === "all" || (c.services && c.services.includes(filterService))) &&
      (filterAM === "all" || c.account_manager_id === filterAM)
  );

  const { sortedData, sortState, toggleSort } = useSortable<Client>({ data: filtered });

  // 🆕 Reset pagination ke PAGE_SIZE setiap kali filter/search/sort berubah.
  // Tanpa ini: user di page 3 (visible=36) → ganti filter → hasil filter cuma 5
  // → tampilan confusing. Reset ke page 1 = UX paling predictable.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filterStatus, filterService, filterAM, sortState.key, sortState.direction]);

  // 🆕 Slice sortedData → hanya render visibleCount pertama (performance).
  // Pattern konsisten dengan reports page (Load More).
  const visibleClients = useMemo(
    () => sortedData.slice(0, visibleCount),
    [sortedData, visibleCount]
  );

  // 🆕 Counters per-status untuk Quick Status Chips (real-time dari data).
  // Dipakai di chip label: "Active (12)", "Onboarding (3)", dst.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: clients.length };
    for (const s of STATUS_OPTIONS) {
      counts[s] = clients.filter((c) => c.status === s).length;
    }
    return counts;
  }, [clients]);

  // ============================================
  // Stats: Now using REAL MRR from financial data
  // ============================================
  const stats = {
    total: clients.length,
    active: clients.filter((c) => c.status === "active").length,
    onboarding: clients.filter((c) => c.status === "onboarding").length,
    hold: clients.filter((c) => c.status === "hold").length,
    // REAL MRR: sum of all active+onboarding clients' real_mrr
    totalMrr: clients
      .filter((c) => c.status === "active" || c.status === "onboarding")
      .reduce((sum, c) => sum + (c.real_mrr || 0), 0),
    totalOutstanding: clients.reduce((sum, c) => sum + (c.outstanding || 0), 0),
    totalPaid: clients.reduce((sum, c) => sum + (c.paid_this_month || 0), 0),
    overdueClients: clients.filter((c) => (c.overdue_count || 0) > 0).length,
  };

  const activeFilterCount =
    (filterStatus !== "all" ? 1 : 0) +
    (filterService !== "all" ? 1 : 0) +
    (filterAM !== "all" ? 1 : 0);

  // Unique services from all clients for filter dropdown
  const allServices = Array.from(new Set(clients.flatMap((c) => c.services || []))).sort();

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-lg" />
          ))}
        </div>
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
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Clients</h1>
          <p className="text-sm text-muted">Daftar klien Hadona Digital Media</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Client
        </button>
      </div>

      {/* ==================== Financial Stats Summary ==================== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Clients */}
        <div className="card p-4">
          <Building2 className="mb-2 text-muted" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted">Total Client</p>
          <div className="mt-1 flex gap-2 text-[10px] text-muted">
            <span className="text-success">{stats.active} active</span>
            <span className="text-primary">{stats.onboarding} onb</span>
            <span className="text-warning">{stats.hold} hold</span>
          </div>
        </div>

        {/* Real MRR */}
        <div className="card p-4">
          <TrendingUp className="mb-2 text-success" size={18} />
          <p className="text-lg font-bold text-success">{formatIDR(stats.totalMrr)}</p>
          <p className="text-xs text-muted">Total MRR (Real)</p>
          <p className="mt-1 text-[10px] text-muted">dari contract_services</p>
        </div>

        {/* Outstanding */}
        <div className="card p-4">
          <Wallet className="mb-2 text-warning" size={18} />
          <p className="text-lg font-bold text-warning">{formatIDR(stats.totalOutstanding)}</p>
          <p className="text-xs text-muted">Outstanding</p>
          <p className="mt-1 text-[10px] text-muted">unpaid + overdue</p>
        </div>

        {/* Paid This Month */}
        <div className="card p-4">
          <CheckCircle className="mb-2 text-success" size={18} />
          <p className="text-lg font-bold text-success">{formatIDR(stats.totalPaid)}</p>
          <p className="text-xs text-muted">Lunas Bulan Ini</p>
        </div>

        {/* Overdue Alert */}
        <div className="card p-4">
          <AlertTriangle className={cn("mb-2", stats.overdueClients > 0 ? "text-danger" : "text-muted")} size={18} />
          <p className={cn("text-2xl font-bold", stats.overdueClients > 0 ? "text-danger" : "text-muted")}>
            {stats.overdueClients}
          </p>
          <p className="text-xs text-muted">Client Overdue</p>
        </div>

        {/* Status Breakdown */}
        <div className="card p-4">
          <Clock className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-primary">{stats.onboarding}</p>
          <p className="text-xs text-muted">Onboarding</p>
        </div>
      </div>

      {/* Search + View Toggle + Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
          <input
            type="text"
            placeholder="Cari nama atau industri client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input py-1.5 pl-8 text-xs"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            showFilters || activeFilterCount > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <Filter size={12} />
          Filter
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
              viewMode === "grid" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
            )}
          >
            <LayoutGrid size={14} /> Grid
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
            )}
          >
            <List size={14} /> Table
          </button>
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
          {/* Filter by Status */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Service */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Service:</label>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              {allServices.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Filter by Account Manager */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">AM:</label>
            <select
              value={filterAM}
              onChange={(e) => setFilterAM(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              {accountManagers.map((am) => (
                <option key={am.id} value={am.id}>{am.full_name}</option>
              ))}
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                // 🆕 Reset ke "active" (default), bukan "all" — sesuai request user.
                setFilterStatus("active");
                setFilterService("all");
                setFilterAM("all");
              }}
              className="text-xs text-danger hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      )}

      {/* 🆕 Quick Status Chips — always-visible filter shortcut.
          Problem: Filter status sebelumnya tersembunyi di balik tombol "Show Filters" → 2 klik untuk ganti.
          Solusi: Chips always-visible di top level, 1 klik = filter langsung.
          Default: "active" (sesuai request user). */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilterStatus("active")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "active"
              ? "border-success bg-success/10 text-success"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Active
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.active || 0}
          </span>
        </button>
        <button
          onClick={() => setFilterStatus("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          All
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.all || 0}
          </span>
        </button>
        <button
          onClick={() => setFilterStatus("onboarding")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "onboarding"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Onboarding
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.onboarding || 0}
          </span>
        </button>
        <button
          onClick={() => setFilterStatus("hold")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "hold"
              ? "border-warning bg-warning/10 text-warning"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Hold
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.hold || 0}
          </span>
        </button>
        <button
          onClick={() => setFilterStatus("inactive")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "inactive"
              ? "border-muted bg-surface text-foreground"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-muted" />
          Inactive
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.inactive || 0}
          </span>
        </button>
        <button
          onClick={() => setFilterStatus("churned")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filterStatus === "churned"
              ? "border-danger bg-danger/10 text-danger"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          Churned
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
            {statusCounts.churned || 0}
          </span>
        </button>
      </div>

      {/* ==================== GRID VIEW ==================== */}
      {viewMode === "grid" && (
        <>
          {filtered.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="mb-3 text-muted" size={32} />
              <p className="text-muted">{search || activeFilterCount > 0 ? "Tidak ada client yang cocok" : "Belum ada client"}</p>
              <button onClick={openCreate} className="btn-primary mt-4">
                <Plus size={16} /> Tambah Client Pertama
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleClients.map((c) => (
                <div key={c.id} className="card card-hover group">
                  <div className="mb-3 flex items-start justify-between">
                    <Link href={`/clients/${c.id}`} className="flex flex-1 items-center gap-3">
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logo_url} alt={c.name} className="h-10 w-10 rounded-lg border border-border object-contain" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-xs font-bold text-primary">
                          {getInitials(c.name)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-foreground hover:text-primary">{c.name}</h3>
                        <p className="text-xs text-muted">{c.industry || "-"}</p>
                      </div>
                    </Link>
                    <span className={cn("badge", statusColors[c.status] || statusColors.inactive)}>
                      {c.status}
                    </span>
                  </div>

                  {/* NEW: MRR Badge */}
                  <div className="mb-3 flex items-center gap-2">
                    {c.real_mrr > 0 ? (
                      <span className="flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-bold text-success">
                        <DollarSign size={10} /> {formatIDR(c.real_mrr)}/bln
                      </span>
                    ) : (
                      <span className="rounded-md bg-surface px-2 py-0.5 text-[10px] text-muted">No MRR</span>
                    )}
                    {c.outstanding > 0 && (
                      <span className="flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                        <AlertTriangle size={9} /> {formatIDR(c.outstanding)} outstanding
                      </span>
                    )}
                    {c.overdue_count > 0 && (
                      <span className="flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
                        {c.overdue_count}x OVERDUE
                      </span>
                    )}
                  </div>

                  {c.services.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1">
                      {c.services.map((s) => (
                        <span key={s} className="badge bg-background text-muted">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AM name */}
                  {c.am_name && (
                    <div className="mb-2 flex items-center gap-1 text-[10px] text-muted">
                      <User size={10} /> AM: {c.am_name}
                    </div>
                  )}

                  {(c.contact_person || c.contact_phone || c.contact_email) && (
                    <div className="mb-3 space-y-1 border-t border-border pt-3 text-xs text-muted">
                      {c.contact_person && <p>👤 {c.contact_person}</p>}
                      {c.contact_phone && (
                        <p className="flex items-center gap-1">
                          <Phone size={10} /> {c.contact_phone}
                        </p>
                      )}
                      {c.contact_email && (
                        <p className="flex items-center gap-1">
                          <Mail size={10} /> {c.contact_email}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Hover actions */}
                  <div className="flex justify-end gap-1 border-t border-border pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 🆕 Load More pagination (Grid View) — tampilkan sisa cards bertahap (12 per klik).
              Pattern konsisten dengan reports page. */}
          {filtered.length > visibleCount && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-primary"
              >
                <ChevronDown size={14} className="animate-bounce" />
                Load More
                <span className="text-muted">
                  ({filtered.length - visibleCount} remaining)
                </span>
              </button>
              <p className="text-[10px] text-muted">
                Showing {visibleClients.length} of {filtered.length} clients
              </p>
            </div>
          )}

          {/* Counter info kalau dataset kecil (tidak melewati PAGE_SIZE) */}
          {filtered.length > 0 && filtered.length <= visibleCount && (
            <p className="mt-4 pb-2 text-center text-[10px] text-muted">
              Showing all {filtered.length} client{filtered.length === 1 ? "" : "s"}
            </p>
          )}
        </>
      )}

      {/* ==================== TABLE VIEW ==================== */}
      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <SortableTh label="Client" sortKey="name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[200px]" />
                <SortableTh label="Industri" sortKey="industry" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[120px]" />
                <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                <th className="w-[160px] px-4 py-3 text-left text-xs font-medium">Services</th>
                <SortableTh label="MRR" sortKey="real_mrr" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[130px]" />
                <SortableTh label="Outstanding" sortKey="outstanding" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[130px]" />
                <th className="w-[120px] px-4 py-3 text-left text-xs font-medium">AM</th>
                <SortableTh label="Dibuat" sortKey="created_at" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                <th className="w-[80px] px-4 py-3 text-right text-xs font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted">Tidak ada client yang cocok</td>
                </tr>
              ) : (
                visibleClients.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-primary/5">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="flex items-center gap-2 hover:text-primary">
                        {c.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logo_url} alt={c.name} className="h-8 w-8 shrink-0 rounded-lg border border-border object-contain" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-[10px] font-bold text-primary">
                            {getInitials(c.name)}
                          </div>
                        )}
                        <span className="truncate font-medium text-foreground">{c.name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      <span className="block truncate" title={c.industry || undefined}>{c.industry || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("badge", statusColors[c.status] || statusColors.inactive)}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.services.slice(0, 2).map((s) => (
                          <span key={s} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">{s}</span>
                        ))}
                        {c.services.length > 2 && (
                          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">+{c.services.length - 2}</span>
                        )}
                        {c.services.length === 0 && <span className="text-xs text-muted">—</span>}
                      </div>
                    </td>
                    {/* MRR Column */}
                    <td className="px-4 py-3">
                      {c.real_mrr > 0 ? (
                        <span className="font-semibold text-success">{formatIDR(c.real_mrr)}</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    {/* Outstanding Column */}
                    <td className="px-4 py-3">
                      {c.outstanding > 0 ? (
                        <div>
                          <span className={cn("font-medium", c.overdue_count > 0 ? "text-danger" : "text-warning")}>
                            {formatIDR(c.outstanding)}
                          </span>
                          {c.overdue_count > 0 && (
                            <span className="ml-1 rounded bg-danger/10 px-1 text-[9px] font-bold text-danger">
                              {c.overdue_count}x OD
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    {/* AM Column */}
                    <td className="px-4 py-3 text-xs text-muted">
                      {c.am_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                          title="Hapus"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* 🆕 Load More pagination (Table View) — sama dengan grid view */}
          {filtered.length > visibleCount && (
            <div className="flex flex-col items-center gap-2 border-t border-border bg-surface px-4 py-3">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-primary"
              >
                <ChevronDown size={14} className="animate-bounce" />
                Load More
                <span className="text-muted">
                  ({filtered.length - visibleCount} remaining)
                </span>
              </button>
              <p className="text-[10px] text-muted">
                Showing {visibleClients.length} of {filtered.length} clients
              </p>
            </div>
          )}
        </div>
      )}

      {/* ==================== Create/Edit Modal (2-Column + Sticky) ==================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* ── Sticky Header ── */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "Edit Client" : "Client Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── Scrollable Body ── */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-2">
                {/* ════ LEFT COLUMN ════ */}
                <div className="space-y-4">
                  {/* Box: Informasi Dasar */}
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Informasi Dasar</p>

                    {/* Logo Upload */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="relative shrink-0">
                        {form.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form.logo_url} alt="Logo" className="h-14 w-14 rounded-lg border border-border object-contain" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-surface text-muted">
                            <Building2 size={18} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface",
                          uploadingLogo && "cursor-wait opacity-60"
                        )}>
                          {uploadingLogo ? (
                            <><Loader2 size={11} className="animate-spin" /> Uploading...</>
                          ) : (
                            <><ImagePlus size={11} /> Upload Logo</>
                          )}
                          <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                        </label>
                        {form.logo_url && (
                          <button type="button" onClick={() => setForm({ ...form, logo_url: "" })} className="ml-2 text-[11px] text-danger hover:underline">
                            Hapus
                          </button>
                        )}
                        <p className="mt-1 text-[10px] text-muted">PNG/JPG, max 2MB</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">Nama Client *</label>
                        <input type="text" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: PT Maju Jaya" className="input" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">Industri</label>
                          <input type="text" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="F&B, Fashion" className="input" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">Status</label>
                          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Box: Kontrak */}
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Kontrak (Estimasi)</p>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                        Auto-sync dari Contract Manager
                      </span>
                    </div>
                    <div className="mb-3 rounded-md bg-primary/5 p-2 text-[10px] text-muted">
                      💡 Estimasi untuk onboarding cepat. Setelah client dibuat, gunakan tab "Kontrak" di detail client untuk kontrak detail & billing per-service. Sistem otomatis update field ini.
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">Nilai Kontrak (Estimasi IDR/bulan)</label>
                        <input type="number" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })} placeholder="Contoh: 5000000" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">Account Manager</label>
                        <select value={form.account_manager_id} onChange={(e) => setForm({ ...form, account_manager_id: e.target.value })} className="input">
                          <option value="">— Pilih AM —</option>
                          {accountManagers.map((am) => (
                            <option key={am.id} value={am.id}>{am.full_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">Mulai Kontrak</label>
                          <input type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} className="input" />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-foreground">Akhir Kontrak</label>
                          <input type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} className="input" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ════ RIGHT COLUMN ════ */}
                <div className="space-y-4">
                  {/* Box: Services */}
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Services</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICE_OPTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => toggleService(s)} className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          form.services.includes(s) ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
                        )}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Box: Kontak */}
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Kontak</p>
                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">Contact Person</label>
                        <input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} placeholder="Nama PIC" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">No. Telepon</label>
                        <input type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="08xxx" className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-foreground">Email</label>
                        <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="pic@client.com" className="input" />
                      </div>
                    </div>
                  </div>

                  {/* Box: Catatan */}
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Catatan</p>
                    <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan..." className="input resize-none" />
                  </div>
                </div>
              </div>

              {/* ── Sticky Footer ── */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
                  ) : editingId ? (
                    "Update Client"
                  ) : (
                    "Simpan Client"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}