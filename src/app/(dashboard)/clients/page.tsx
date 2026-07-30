"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
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

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success",
  inactive: "bg-surface text-muted",
  hold: "bg-warning/20 text-warning",
  onboarding: "bg-primary/20 text-primary",
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
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

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

  async function loadClients() {
    try {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      setClients((data as unknown as Client[]) || []);
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

    // Validate: image only, max 2MB
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
      const msg = err instanceof Error ? err.message : "Unknown error";
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
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal hapus: " + msg);
    }
  }

  // Filtered data
  const filtered = clients.filter(
    (c) =>
      (!search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.industry?.toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "all" || c.status === filterStatus)
  );

  // Sortable table data
  const { sortedData, sortState, toggleSort } = useSortable<Client>({ data: filtered });

  // Stats
  const stats = {
    total: clients.length,
    active: clients.filter((c) => c.status === "active").length,
    onboarding: clients.filter((c) => c.status === "onboarding").length,
    hold: clients.filter((c) => c.status === "hold").length,
    totalMrr: clients.reduce((sum, c) => sum + (c.contract_value || 0), 0),
  };

  const activeFilterCount = (filterStatus !== "all" ? 1 : 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-muted">Daftar klien Hadona Digital Media</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Client
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="card p-4">
          <Building2 className="mb-2 text-muted" size={18} />
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-muted">Total Client</p>
        </div>
        <div className="card p-4">
          <CheckCircle className="mb-2 text-success" size={18} />
          <p className="text-2xl font-bold text-success">{stats.active}</p>
          <p className="text-xs text-muted">Active</p>
        </div>
        <div className="card p-4">
          <Clock className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-primary">{stats.onboarding}</p>
          <p className="text-xs text-muted">Onboarding</p>
        </div>
        <div className="card p-4">
          <PauseCircle className="mb-2 text-warning" size={18} />
          <p className="text-2xl font-bold text-warning">{stats.hold}</p>
          <p className="text-xs text-muted">Hold</p>
        </div>
        <div className="card p-4">
          <Building2 className="mb-2 text-success" size={18} />
          <p className="text-lg font-bold text-success">{formatIDR(stats.totalMrr)}</p>
          <p className="text-xs text-muted">Total MRR</p>
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
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-gray-900">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            showFilters || activeFilterCount > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-gray-900"
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
              viewMode === "grid" ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
            )}
          >
            <LayoutGrid size={14} /> Grid
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
              viewMode === "table" ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
            )}
          >
            <List size={14} /> Table
          </button>
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="hold">Hold</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilterStatus("all")}
              className="text-xs text-danger hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      )}

      {/* ==================== GRID VIEW ==================== */}
      {viewMode === "grid" && (
        <>
          {filtered.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="mb-3 text-muted" size={32} />
              <p className="text-muted">{search || filterStatus !== "all" ? "Tidak ada client yang cocok" : "Belum ada client"}</p>
              <button onClick={openCreate} className="btn-primary mt-4">
                <Plus size={16} /> Tambah Client Pertama
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c) => (
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
                        <h3 className="font-semibold text-gray-900 hover:text-primary">{c.name}</h3>
                        <p className="text-xs text-muted">{c.industry || "-"}</p>
                      </div>
                    </Link>
                    <span className={cn("badge", statusColors[c.status] || statusColors.inactive)}>
                      {c.status}
                    </span>
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
        </>
      )}

      {/* ==================== TABLE VIEW ==================== */}
      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <SortableTh label="Client" sortKey="name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[200px]" />
                <SortableTh label="Industri" sortKey="industry" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[140px]" />
                <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                <th className="w-[200px] px-4 py-3 text-left text-xs font-medium">Services</th>
                <th className="w-[150px] px-4 py-3 text-left text-xs font-medium">Contact Person</th>
                <SortableTh label="Dibuat" sortKey="created_at" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[110px]" />
                <th className="w-[80px] px-4 py-3 text-right text-xs font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted">Tidak ada client yang cocok</td>
                </tr>
              ) : (
                sortedData.map((c) => (
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
                        <span className="truncate font-medium text-gray-900">{c.name}</span>
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
                        {c.services.slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">{s}</span>
                        ))}
                        {c.services.length > 3 && (
                          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">+{c.services.length - 3}</span>
                        )}
                        {c.services.length === 0 && <span className="text-xs text-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {c.contact_person || "—"}
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
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Client" : "Client Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Logo Upload */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.logo_url}
                      alt="Logo"
                      className="h-16 w-16 rounded-lg border border-border object-contain"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-background text-muted">
                      <Building2 size={20} />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Logo Client</label>
                  <label className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background",
                    uploadingLogo && "cursor-wait opacity-60"
                  )}>
                    {uploadingLogo ? (
                      <>
                        <Loader2 size={12} className="animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <ImagePlus size={12} /> Upload Logo
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      className="hidden"
                    />
                  </label>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, logo_url: "" })}
                      className="ml-2 text-xs text-danger hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                  <p className="mt-1 text-[10px] text-muted">PNG/JPG, max 2MB</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Nama Client *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: PT Maju Jaya"
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Industri</label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    placeholder="Contoh: F&B, Fashion"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    <option value="active">Active</option>
                    <option value="onboarding">Onboarding</option>
                    <option value="hold">Hold</option>
                    <option value="inactive">Inactive</option>
                    <option value="churned">Churned</option>
                  </select>
                </div>
              </div>

              {/* Contract Section */}
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Kontrak</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Nilai Kontrak (IDR/bulan)</label>
                    <input
                      type="number"
                      value={form.contract_value}
                      onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                      placeholder="Contoh: 5000000"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Account Manager</label>
                    <select
                      value={form.account_manager_id}
                      onChange={(e) => setForm({ ...form, account_manager_id: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih AM —</option>
                      {accountManagers.map((am) => (
                        <option key={am.id} value={am.id}>{am.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Mulai Kontrak</label>
                    <input
                      type="date"
                      value={form.contract_start}
                      onChange={(e) => setForm({ ...form, contract_start: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-900">Akhir Kontrak</label>
                    <input
                      type="date"
                      value={form.contract_end}
                      onChange={(e) => setForm({ ...form, contract_end: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">Services</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        form.services.includes(s)
                          ? "bg-primary text-white"
                          : "bg-background text-muted hover:text-gray-900"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Contact Person</label>
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    placeholder="Nama PIC"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">No. Telepon</label>
                  <input
                    type="tel"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    placeholder="08xxx"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Email</label>
                <input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="pic@client.com"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Catatan</label>
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