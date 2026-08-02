"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Target, Plus, X, Pencil, Trash2, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { cn, extractError } from "@/lib/utils";

interface OKR {
  id: string;
  objective: string;
  key_result: string | null;
  quarter: string;
  year: number;
  owner_id: string | null;
  target_value: number | null;
  actual_value: number | null;
  unit: string | null;
  progress_pct: number;
  status: string;
  notes: string | null;
  owner?: { full_name: string | null };
}

interface TeamMember {
  id: string;
  full_name: string | null;
}

const emptyForm = {
  objective: "",
  key_result: "",
  quarter: "Q1",
  year: new Date().getFullYear(),
  owner_id: "",
  target_value: "",
  actual_value: "",
  unit: "%",
  notes: "",
};

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: "bg-success/20 text-success", label: "Completed" },
  on_track: { color: "bg-primary/20 text-primary", label: "On Track" },
  at_risk: { color: "bg-warning/20 text-warning", label: "At Risk" },
  behind: { color: "bg-danger/20 text-danger", label: "Behind" },
};

const progressBarColor = (pct: number) => {
  if (pct >= 100) return "bg-success";
  if (pct >= 70) return "bg-primary";
  if (pct >= 40) return "bg-warning";
  return "bg-danger";
};

export default function StrategyPage() {
  const supabase = createClient();
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadOKRs();
    loadTeam();
  }, []);

  async function loadOKRs() {
    try {
      const { data, error } = await supabase
        .from("okrs")
        .select("*, owner:profiles!owner_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOkrs((data as unknown as OKR[]) || []);
    } catch (err) {
      const msg = extractError(err);
      setError("Gagal memuat OKR: " + msg);
      toast.error("Gagal memuat OKR: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeam() {
    const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
    setTeam((data as unknown as TeamMember[]) || []);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(okr: OKR) {
    setForm({
      objective: okr.objective,
      key_result: okr.key_result || "",
      quarter: okr.quarter,
      year: okr.year,
      owner_id: okr.owner_id || "",
      target_value: okr.target_value?.toString() || "",
      actual_value: okr.actual_value?.toString() || "",
      unit: okr.unit || "%",
      notes: okr.notes || "",
    });
    setEditingId(okr.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.objective.trim()) {
      toast.error("Objective wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      const payload = {
        objective: form.objective.trim(),
        key_result: form.key_result.trim() || null,
        quarter: form.quarter,
        year: form.year,
        owner_id: form.owner_id || null,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        actual_value: form.actual_value ? parseFloat(form.actual_value) : null,
        unit: form.unit || null,
        notes: form.notes.trim() || null,
        created_by: editingId ? undefined : userData.user?.id,
      };

      if (editingId) {
        const { error } = await supabase.from("okrs").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("OKR diupdate!");
      } else {
        const { error } = await supabase.from("okrs").insert(payload as never);
        if (error) throw error;
        toast.success("OKR dibuat!");
      }

      setShowModal(false);
      loadOKRs();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus OKR ini?")) return;
    try {
      const { error } = await supabase.from("okrs").delete().eq("id", id);
      if (error) throw error;
      toast.success("OKR dihapus");
      loadOKRs();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  // Group OKRs by objective
  const filtered = okrs.filter(
    (o) => quarterFilter === "all" || `${o.quarter}-${o.year}` === quarterFilter
  );

  const grouped = filtered.reduce((acc, okr) => {
    const key = `${okr.objective} [${okr.quarter} ${okr.year}]`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(okr);
    return acc;
  }, {} as Record<string, OKR[]>);

  // Summary stats
  const totalOKRs = filtered.length;
  const avgProgress =
    totalOKRs > 0 ? Math.round(filtered.reduce((sum, o) => sum + o.progress_pct, 0) / totalOKRs) : 0;
  const completedCount = filtered.filter((o) => o.status === "completed").length;

  const quarters = Array.from(new Set(okrs.map((o) => `${o.quarter}-${o.year}`))).sort().reverse();

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Strategy & OKR</h1>
        <div className="skeleton h-32 rounded-lg" />
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
        <p className="mt-2 text-xs text-muted">
          Pastikan migration-v4.sql sudah di-run di Supabase
        </p>
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
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Strategy & OKR</h1>
          <p className="text-sm text-muted">Objectives and Key Results tracker</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New OKR
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted">Total Key Results</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{totalOKRs}</p>
            </div>
            <Target className="text-primary" size={24} />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted">Avg Progress</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{avgProgress}%</p>
            </div>
            <TrendingUp className="text-success" size={24} />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-muted">Completed</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {completedCount}
                <span className="text-sm text-muted"> / {totalOKRs}</span>
              </p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20">
              <span className="text-sm font-bold text-success">✓</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quarter Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setQuarterFilter("all")}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            quarterFilter === "all" ? "bg-primary text-white" : "bg-surface text-muted hover:text-white"
          )}
        >
          Semua Periode
        </button>
        {quarters.map((q) => (
          <button
            key={q}
            onClick={() => setQuarterFilter(q)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              quarterFilter === q ? "bg-primary text-white" : "bg-surface text-muted hover:text-white"
            )}
          >
            {q}
          </button>
        ))}
      </div>

      {/* OKR List */}
      {totalOKRs === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Target className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada OKR</p>
          <p className="mt-1 text-xs text-muted">Mulai dengan membuat objective pertama Anda</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Buat OKR
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([objective, krs]) => {
            const objAvg =
              krs.length > 0
                ? Math.round(krs.reduce((sum, k) => sum + k.progress_pct, 0) / krs.length)
                : 0;
            return (
              <div key={objective} className="card overflow-hidden p-0">
                {/* Objective Header */}
                <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Target className="text-primary" size={16} />
                      <h3 className="font-semibold text-gray-900">{objective}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {krs.length} Key Result{ krs.length > 1 ? "s" : ""} • Avg: {objAvg}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-background">
                      <div
                        className={cn("h-full transition-all", progressBarColor(objAvg))}
                        style={{ width: `${objAvg}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900">{objAvg}%</span>
                  </div>
                </div>

                {/* Key Results */}
                <div className="divide-y divide-border">
                  {krs.map((kr) => (
                    <div key={kr.id} className="group flex items-center gap-4 px-5 py-3 hover:bg-surface/50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {kr.key_result || "No Key Result defined"}
                          </p>
                          <span
                            className={cn(
                              "badge text-xs",
                              statusConfig[kr.status]?.color || statusConfig.on_track.color
                            )}
                          >
                            {statusConfig[kr.status]?.label || kr.status}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                          {kr.owner?.full_name && <span>👤 {kr.owner.full_name}</span>}
                          {kr.target_value !== null && (
                            <span>
                              📊 {kr.actual_value || 0} / {kr.target_value} {kr.unit || ""}
                            </span>
                          )}
                          {kr.notes && <span className="italic">💬 {kr.notes}</span>}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-background">
                          <div
                            className={cn("h-full transition-all", progressBarColor(kr.progress_pct))}
                            style={{ width: `${kr.progress_pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-sm font-bold text-gray-900">
                          {kr.progress_pct}%
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(kr)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(kr.id)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                          title="Hapus"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal — Sticky Header/Footer + Scroll */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit OKR" : "OKR Baru"}
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
                    Objective *
                  </label>
                <input
                  type="text"
                  required
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="Contoh: Tingkatkan revenue agency Q1"
                  className="input"
                />
                <p className="mt-1 text-xs text-muted">
                  Objective = tujuan strategis (qualitative)
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
                  Key Result
                </label>
                <input
                  type="text"
                  value={form.key_result}
                  onChange={(e) => setForm({ ...form, key_result: e.target.value })}
                  placeholder="Contoh: Capai ROAS rata-rata 3.5"
                  className="input"
                />
                <p className="mt-1 text-xs text-muted">
                  Key Result = cara mengukur objective (quantitative)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Quarter</label>
                  <select
                    value={form.quarter}
                    onChange={(e) => setForm({ ...form, quarter: e.target.value })}
                    className="input"
                  >
                    <option value="Q1">Q1 (Jan-Mar)</option>
                    <option value="Q2">Q2 (Apr-Jun)</option>
                    <option value="Q3">Q3 (Jul-Sep)</option>
                    <option value="Q4">Q4 (Okt-Des)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Tahun</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Owner (PIC)</label>
                <select
                  value={form.owner_id}
                  onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Pilih Owner —</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || "Unknown"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Target</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.target_value}
                    onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                    placeholder="100"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Actual</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.actual_value}
                    onChange={(e) => setForm({ ...form, actual_value: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Unit</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="%, IDR, ROAS"
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
                    "Update OKR"
                  ) : (
                    "Simpan OKR"
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