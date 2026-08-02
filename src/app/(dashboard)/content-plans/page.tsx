"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Plus,
  X,
  ExternalLink,
  Trash2,
  Pencil,
  Search,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface ContentPlan {
  id: string;
  client_id: string;
  month: string;
  plan_url: string | null;
  services: string[];
  notes: string | null;
  status: string;
  created_at: string;
  client?: { name: string };
}

interface Client {
  id: string;
  name: string;
}

const SERVICE_OPTIONS = [
  "Meta Ads",
  "Google Ads",
  "TikTok",
  "SEO",
  "Content",
  "Social Media",
  "Web Dev",
];

const statusColors: Record<string, string> = {
  draft: "bg-surface text-muted",
  in_review: "bg-warning/20 text-warning",
  approved: "bg-success/20 text-success",
  published: "bg-primary/20 text-primary",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  published: "Published",
};

const emptyForm = {
  client_id: "",
  month: "",
  plan_url: "",
  notes: "",
  services: [] as string[],
  status: "draft",
};

export default function ContentPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadPlans();
    loadClients();
  }, [supabase]);

  async function loadPlans() {
    try {
      const { data, error } = await supabase
        .from("content_plans")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPlans((data as unknown as ContentPlan[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal memuat content plans: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
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
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(plan: ContentPlan) {
    setEditingId(plan.id);
    setForm({
      client_id: plan.client_id,
      month: plan.month,
      plan_url: plan.plan_url || "",
      notes: plan.notes || "",
      services: plan.services || [],
      status: plan.status || "draft",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || !form.month) {
      toast.error("Client dan Bulan wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        month: form.month,
        plan_url: form.plan_url || null,
        services: form.services,
        notes: form.notes.trim() || null,
        status: form.status,
      };

      if (editingId) {
        const { error } = await supabase
          .from("content_plans")
          .update(payload as never)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Content plan diupdate!");
      } else {
        const { error } = await supabase.from("content_plans").insert(payload as never);
        if (error) throw error;
        toast.success("Content plan dibuat!");
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus content plan ini?")) return;
    try {
      const { error } = await supabase.from("content_plans").delete().eq("id", id);
      if (error) throw error;
      toast.success("Plan dihapus");
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal hapus: " + msg);
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

  // Filter logic
  const filtered = plans.filter((p) => {
    const matchSearch =
      !search ||
      p.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.notes?.toLowerCase().includes(search.toLowerCase()) ||
      p.month.includes(search);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const matchClient = clientFilter === "all" || p.client_id === clientFilter;
    return matchSearch && matchStatus && matchClient;
  });

  // Stats
  const totalPlans = plans.length;
  const draftCount = plans.filter((p) => p.status === "draft").length;
  const approvedCount = plans.filter((p) => p.status === "approved").length;
  const publishedCount = plans.filter((p) => p.status === "published").length;

  const statCards = [
    { label: "Total Plans", value: totalPlans, icon: CalendarDays, color: "text-primary", bg: "bg-primary/10" },
    { label: "Draft", value: draftCount, icon: Clock, color: "text-muted", bg: "bg-surface" },
    { label: "Approved", value: approvedCount, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Published", value: publishedCount, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Content Plans</h1>
          <p className="text-sm text-muted">Content calendar & plan per klien</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Plan
        </button>
      </div>

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
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client, bulan, atau catatan..."
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
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
        </select>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="mb-3 text-muted" size={32} />
          <p className="text-muted">
            {plans.length === 0 ? "Belum ada content plan" : "Tidak ada plan yang cocok dengan filter"}
          </p>
          {plans.length === 0 ? (
            <button onClick={openCreate} className="btn-primary mt-4">
              <Plus size={16} /> Buat Plan Pertama
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.id} className="card group">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.client?.name || "Unknown"}</h3>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <CalendarDays size={12} /> {formatDate(p.month + "-01", { month: "long", year: "numeric" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("badge", statusColors[p.status] || statusColors.draft)}>
                    {statusLabels[p.status] || p.status}
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {p.services.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {p.services.map((s) => (
                    <span key={s} className="badge bg-background text-muted">
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {p.notes && <p className="mb-3 text-sm text-muted">{p.notes}</p>}

              {p.plan_url && (
                <a
                  href={p.plan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={12} /> Lihat Content Plan
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal — Sticky Header/Footer + Scroll */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Content Plan" : "Content Plan Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Bulan *</label>
                  <input
                    type="month"
                    required
                    value={form.month}
                    onChange={(e) => setForm({ ...form, month: e.target.value })}
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
                    <option value="draft">Draft</option>
                    <option value="in_review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="published">Published</option>
                  </select>
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
                  Plan URL (Google Sheets/Drive)
                </label>
                <input
                  type="url"
                  value={form.plan_url}
                  onChange={(e) => setForm({ ...form, plan_url: e.target.value })}
                  placeholder="https://docs.google.com/..."
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

              </div>

              {/* Sticky Footer */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
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
                    "Update Plan"
                  ) : (
                    "Simpan Plan"
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