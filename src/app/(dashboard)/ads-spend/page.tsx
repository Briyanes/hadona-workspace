"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
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
} from "lucide-react";
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
  client?: { name: string };
}

interface Client {
  id: string;
  name: string;
}

const emptyForm = {
  client_id: "",
  platform: "META",
  ad_account_id: "",
  account_name: "",
  objective: "",
  daily_budget: "",
  remaining_budget: "",
  days_left: "",
  status: "active",
  notes: "",
};

export default function AdsSpendPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadAccounts();
    loadClients();
  }, []);

  async function loadAccounts() {
    try {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*, client:clients(name)")
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

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").order("name");
    setClients((data as unknown as Client[]) || []);
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
      days_left: account.days_left?.toString() || "",
      status: account.status,
      notes: account.notes || "",
    });
    setEditingId(account.id);
    setShowModal(true);
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
        days_left: form.days_left ? parseInt(form.days_left) : null,
        status: form.status,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase.from("ad_accounts").update(payload as never).eq("id", editingId);
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

  const filtered = accounts.filter((a) => {
    const matchSearch =
      !search ||
      a.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.ad_account_id.includes(search) ||
      a.account_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const { sortedData, sortState, toggleSort } = useSortable<AdAccount>({ data: filtered });

  const totalDaily = accounts
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);

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
            Total Budget Harian: <span className="font-semibold text-gray-900">{formatIDR(totalDaily)}</span>
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Ad Account
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client atau ad account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
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
                <SortableTh label="Client" sortKey="client.name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Platform" sortKey="platform" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Ad Account ID" sortKey="ad_account_id" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Objective" sortKey="objective" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} />
                <SortableTh label="Daily Budget" sortKey="daily_budget" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" />
                <SortableTh label="Remaining" sortKey="remaining_budget" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="right" />
                <SortableTh label="Days Left" sortKey="days_left" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="center" />
                <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} align="center" />
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedData.map((a) => (
                <tr key={a.id} className="group hover:bg-surface/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.client?.name || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("badge", platformColors[a.platform] || "bg-surface text-muted")}>
                      {a.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{a.ad_account_id}</td>
                  <td className="px-4 py-3 text-muted">{a.objective || "-"}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatIDR(a.daily_budget)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{formatIDR(a.remaining_budget)}</td>
                  <td className="px-4 py-3 text-center">
                    {a.days_left !== null && a.days_left <= 3 ? (
                      <span className="badge bg-danger/20 text-danger">
                        <AlertTriangle size={10} /> {a.days_left}d
                      </span>
                    ) : (
                      <span className="text-muted">{a.days_left ? `${a.days_left}d` : "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("badge", statusColors[a.status] || statusColors.inactive)}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              ))}
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
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Client *</label>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Platform *</label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="input"
                  >
                    <option value="META">META (Facebook/Instagram)</option>
                    <option value="Google">Google Ads</option>
                    <option value="TikTok">TikTok Ads</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Ad Account ID *</label>
                  <input
                    type="text"
                    required
                    value={form.ad_account_id}
                    onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })}
                    placeholder="Contoh: 1234567890"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Account Name</label>
                  <input
                    type="text"
                    value={form.account_name}
                    onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                    placeholder="Nickname untuk akun"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Objective</label>
                <input
                  type="text"
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="Contoh: Conversions, Traffic, Awareness"
                  className="input"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Daily Budget (Rp)</label>
                  <input
                    type="number"
                    value={form.daily_budget}
                    onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Remaining (Rp)</label>
                  <input
                    type="number"
                    value={form.remaining_budget}
                    onChange={(e) => setForm({ ...form, remaining_budget: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Days Left</label>
                  <input
                    type="number"
                    value={form.days_left}
                    onChange={(e) => setForm({ ...form, days_left: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
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
    </div>
  );
}