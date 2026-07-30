"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, X, Pencil, Trash2, AlertCircle, Search, Clock, CheckCircle, Send, Loader2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

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
  client?: { name: string };
  pic?: { full_name: string };
}

interface Client {
  id: string;
  name: string;
}

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
  const emptyForm = {
    client_id: "",
    period_start: "",
    period_end: "",
    summary: "",
    performance_text: "",
    conclusion: "",
    action: "",
    status: "draft",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadReports();
    loadClients();
  }, [supabase]);

  async function loadReports() {
    try {
      const { data, error } = await supabase
        .from("weekly_reports")
        .select("*, client:clients(name), pic:profiles(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReports((data as unknown as Report[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat laporan: " + msg);
      toast.error("Gagal memuat data laporan");
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data, error } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    if (error) {
      toast.error("Gagal memuat daftar client");
      return;
    }
    setClients((data as unknown as Client[]) || []);
  }

  function openEdit(report: Report) {
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
    });
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus laporan ini?")) return;
    try {
      const { error } = await supabase.from("weekly_reports").delete().eq("id", id);
      if (error) throw error;
      toast.success("Laporan dihapus");
      loadReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal hapus: " + msg);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
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

      if (editingId) {
        const { error } = await supabase.from("weekly_reports").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("Laporan berhasil diupdate!");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("weekly_reports").insert({
          ...payload,
          pic_id: userData.user?.id,
        } as never);
        if (error) throw error;
        toast.success("Laporan berhasil dibuat!");
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      loadReports();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  const statusColors: Record<string, string> = {
    draft: "bg-surface text-muted",
    submitted: "bg-warning/20 text-warning",
    reviewed: "bg-success/20 text-success",
  };

  // Filter logic
  const filtered = reports.filter((r) => {
    const matchSearch =
      !search ||
      r.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.summary?.toLowerCase().includes(search.toLowerCase()) ||
      r.performance_text?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchClient = clientFilter === "all" || r.client_id === clientFilter;
    return matchSearch && matchStatus && matchClient;
  });

  // Stats
  const totalReports = reports.length;
  const draftCount = reports.filter((r) => r.status === "draft").length;
  const submittedCount = reports.filter((r) => r.status === "submitted").length;
  const reviewedCount = reports.filter((r) => r.status === "reviewed").length;

  const statCards = [
    { label: "Total Reports", value: totalReports, icon: FileText, color: "text-primary", bg: "bg-primary/10" },
    { label: "Draft", value: draftCount, icon: Clock, color: "text-muted", bg: "bg-surface" },
    { label: "Submitted", value: submittedCount, icon: Send, color: "text-warning", bg: "bg-warning/10" },
    { label: "Reviewed", value: reviewedCount, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Weekly Reports</h1>
          <p className="text-sm text-muted">Laporan performa klien mingguan</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Report
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
            placeholder="Cari client, ringkasan, atau performa..."
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
            <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
              <Plus size={16} /> Buat Laporan Pertama
            </button>
          ) : (
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setClientFilter("all"); }}
              className="btn-primary mt-4"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => (
            <div key={r.id} className="card card-hover group">
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

              {r.summary && <p className="mb-2 line-clamp-2 text-sm text-muted">{r.summary}</p>}

              {r.performance_text && (
                <div className="mb-3 rounded-md border border-border bg-background p-2">
                  <p className="text-xs text-muted">Performance:</p>
                  <p className="text-sm text-gray-900">{r.performance_text}</p>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted">PIC: {r.pic?.full_name || "-"}</span>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                    title="Edit"
                  >
                    <Pencil size={14} />
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
          ))}
        </div>
      )}

      {/* Create Report Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Weekly Report" : "Buat Weekly Report"}
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Periode Mulai *</label>
                  <input
                    type="date"
                    required
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Periode Selesai *</label>
                  <input
                    type="date"
                    required
                    value={form.period_end}
                    onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

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
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Performance</label>
                <textarea
                  rows={3}
                  value={form.performance_text}
                  onChange={(e) => setForm({ ...form, performance_text: e.target.value })}
                  placeholder="Detail metrik & performa (spend, CPR, CTR, dll)..."
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
    </div>
  );
}