"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, ChevronRight, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Report {
  id: string;
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

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    period_start: "",
    period_end: "",
    summary: "",
    performance_text: "",
    conclusion: "",
    action: "",
    status: "draft",
  });

  useEffect(() => {
    loadReports();
    loadClients();
  }, [supabase]);

  async function loadReports() {
    const { data } = await supabase
      .from("weekly_reports")
      .select("*, client:clients(name), pic:profiles(full_name)")
      .order("created_at", { ascending: false });
    setReports((data as unknown as Report[]) || []);
    setLoading(false);
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function handleCreateReport(e: React.FormEvent) {
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
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("weekly_reports").insert({
      client_id: form.client_id,
      pic_id: userData.user?.id,
      period_start: form.period_start,
      period_end: form.period_end,
      summary: form.summary.trim() || null,
      performance_text: form.performance_text.trim() || null,
      conclusion: form.conclusion.trim() || null,
      action: form.action.trim() || null,
      status: form.status,
    } as never);

    if (error) {
      toast.error("Gagal membuat laporan: " + error.message);
    } else {
      toast.success("Laporan berhasil dibuat!");
      setForm({
        client_id: "",
        period_start: "",
        period_end: "",
        summary: "",
        performance_text: "",
        conclusion: "",
        action: "",
        status: "draft",
      });
      setShowModal(false);
      loadReports();
    }
    setSaving(false);
  }

  const statusColors: Record<string, string> = {
    draft: "bg-surface text-muted",
    submitted: "bg-warning/20 text-warning",
    reviewed: "bg-success/20 text-success",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Reports</h1>
          <p className="text-sm text-muted">Laporan performa klien mingguan</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> New Report
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada laporan mingguan</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
            <Plus size={16} /> Buat Laporan Pertama
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <div key={r.id} className="card card-hover cursor-pointer">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{r.client?.name || "Unknown Client"}</h3>
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
                  <p className="text-sm text-white">{r.performance_text}</p>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted">PIC: {r.pic?.full_name || "-"}</span>
                <ChevronRight size={16} className="text-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Report Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Buat Weekly Report</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Client *</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Periode Mulai *</label>
                  <input
                    type="date"
                    required
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Periode Selesai *</label>
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
                <label className="mb-1.5 block text-sm font-medium text-white">Ringkasan</label>
                <textarea
                  rows={2}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                  placeholder="Ringkasan aktivitas/capaian minggu ini..."
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Performance</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Kesimpulan</label>
                  <textarea
                    rows={2}
                    value={form.conclusion}
                    onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                    placeholder="Kesimpulan & insight..."
                    className="input resize-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Action Plan</label>
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
                <label className="mb-1.5 block text-sm font-medium text-white">Status</label>
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
                  className="px-4 py-2 text-sm text-muted hover:text-white"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Menyimpan..." : "Simpan Laporan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}