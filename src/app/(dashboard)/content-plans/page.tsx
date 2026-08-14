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
  // New columns
  pilar: string | null;
  konten: string | null;
  copy: string | null;
  details: string | null;
  reference: string | null;
  caption: string | null;
  link_hasil: string | null;
  tanggal_upload: string | null;
  progress: string | null;
}

interface Client {
  id: string;
  name: string;
}

// ── Dropdown Options ──────────────────────────────────────
const PILAR_OPTIONS = [
  "Education",
  "Awareness",
  "Product Highlight",
  "UGC/RTW",
  "Before-After",
  "USP/UVP",
  "Emotional/Pain Point",
  "Social Proof",
  "Conversion",
  "Product Launch",
];

const KONTEN_OPTIONS = ["Reels", "Single Image", "Carousel", "Mix Type"];

const PROGRESS_OPTIONS = ["Done", "Proses Edit", "Cancel"];

// ── Progress Badge Colors ─────────────────────────────────
const progressColors: Record<string, string> = {
  done: "bg-success/20 text-success",
  proses_edit: "bg-warning/20 text-warning",
  cancel: "bg-danger/20 text-danger",
};

const progressLabels: Record<string, string> = {
  done: "Done",
  proses_edit: "Proses Edit",
  cancel: "Cancel",
};

function getProgressKey(value: string | null): string {
  if (!value) return "proses_edit";
  const lower = value.toLowerCase().replace(/\s+/g, "_");
  return lower;
}

// ── Empty Form ────────────────────────────────────────────
const emptyForm = {
  client_id: "",
  month: "",
  pilar: "",
  konten: "",
  copy: "",
  details: "",
  reference: "",
  caption: "",
  link_hasil: "",
  tanggal_upload: "",
  progress: "Proses Edit",
  // Keep old fields for backward compat
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
  const [progressFilter, setProgressFilter] = useState("all");
  const [pilarFilter, setPilarFilter] = useState("all");
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
      pilar: plan.pilar || "",
      konten: plan.konten || "",
      copy: plan.copy || "",
      details: plan.details || "",
      reference: plan.reference || "",
      caption: plan.caption || "",
      link_hasil: plan.link_hasil || "",
      tanggal_upload: plan.tanggal_upload || "",
      progress: plan.progress || "Proses Edit",
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
        pilar: form.pilar || null,
        konten: form.konten || null,
        copy: form.copy.trim() || null,
        details: form.details.trim() || null,
        reference: form.reference.trim() || null,
        caption: form.caption.trim() || null,
        link_hasil: form.link_hasil.trim() || null,
        tanggal_upload: form.tanggal_upload || null,
        progress: form.progress,
        // Keep old fields
        plan_url: form.plan_url || null,
        notes: form.notes.trim() || null,
        services: form.services,
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

  // ── Quick inline progress update ─────────────────────────
  async function quickUpdateProgress(id: string, progress: string) {
    try {
      const { error } = await supabase
        .from("content_plans")
        .update({ progress } as never)
        .eq("id", id);
      if (error) throw error;
      toast.success("Progress diperbarui");
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal update progress: " + msg);
    }
  }

  // ── Filter Logic ─────────────────────────────────────────
  const filtered = plans.filter((p) => {
    const matchSearch =
      !search ||
      p.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.copy?.toLowerCase().includes(search.toLowerCase()) ||
      p.details?.toLowerCase().includes(search.toLowerCase()) ||
      p.caption?.toLowerCase().includes(search.toLowerCase()) ||
      p.pilar?.toLowerCase().includes(search.toLowerCase()) ||
      p.month.includes(search);
    const pKey = getProgressKey(p.progress);
    const matchProgress = progressFilter === "all" || pKey === progressFilter;
    const matchPilar = pilarFilter === "all" || p.pilar === pilarFilter;
    const matchClient = clientFilter === "all" || p.client_id === clientFilter;
    return matchSearch && matchProgress && matchPilar && matchClient;
  });

  // ── Stats ────────────────────────────────────────────────
  const totalPlans = plans.length;
  const doneCount = plans.filter((p) => getProgressKey(p.progress) === "done").length;
  const prosesCount = plans.filter((p) => getProgressKey(p.progress) === "proses_edit").length;
  const cancelCount = plans.filter((p) => getProgressKey(p.progress) === "cancel").length;

  const statCards = [
    { label: "Total Plans", value: totalPlans, icon: CalendarDays, color: "text-primary", bg: "bg-primary/10" },
    { label: "Done", value: doneCount, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Proses Edit", value: prosesCount, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
    { label: "Cancel", value: cancelCount, icon: FileText, color: "text-danger", bg: "bg-danger/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Content Plans</h1>
          <p className="text-sm text-muted">Content production tracker per klien</p>
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
              <p className="mt-0.5 text-lg font-bold text-foreground">{card.value}</p>
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
            placeholder="Cari client, pilar, copy, caption..."
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
        <select value={pilarFilter} onChange={(e) => setPilarFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Pilar</option>
          {PILAR_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Progress</option>
          <option value="done">Done</option>
          <option value="proses_edit">Proses Edit</option>
          <option value="cancel">Cancel</option>
        </select>
      </div>

      {/* Table View */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
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
                setProgressFilter("all");
                setPilarFilter("all");
                setClientFilter("all");
              }}
              className="btn-primary mt-4"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface">
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-3 py-3 font-medium">No</th>
                  <th className="px-3 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 font-medium">Bulan</th>
                  <th className="px-3 py-3 font-medium">Pilar</th>
                  <th className="px-3 py-3 font-medium">Konten</th>
                  <th className="px-3 py-3 font-medium">Copy</th>
                  <th className="px-3 py-3 font-medium">Details</th>
                  <th className="px-3 py-3 font-medium">Reference</th>
                  <th className="px-3 py-3 font-medium">Caption</th>
                  <th className="px-3 py-3 font-medium">Link Hasil</th>
                  <th className="px-3 py-3 font-medium">Tgl Upload</th>
                  <th className="px-3 py-3 font-medium">Progress</th>
                  <th className="px-3 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const pKey = getProgressKey(p.progress);
                  return (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-surface/50">
                      <td className="px-3 py-2.5 text-muted">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{p.client?.name || "-"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {formatDate(p.month + "-01", { month: "short", year: "numeric" })}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.pilar ? <span className="badge bg-background text-muted">{p.pilar}</span> : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.konten ? <span className="badge bg-background text-muted">{p.konten}</span> : "-"}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2.5 text-muted" title={p.copy || ""}>
                        {p.copy || "-"}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2.5 text-muted" title={p.details || ""}>
                        {p.details || "-"}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2.5 text-muted" title={p.reference || ""}>
                        {p.reference ? (
                          <a
                            href={p.reference}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {p.reference}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-muted" title={p.caption || ""}>
                        {p.caption || "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.link_hasil ? (
                          <a
                            href={p.link_hasil}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink size={12} /> Link
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {p.tanggal_upload ? formatDate(p.tanggal_upload) : "-"}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={pKey}
                          onChange={(e) => quickUpdateProgress(p.id, e.target.value)}
                          className={cn(
                            "cursor-pointer rounded border-0 px-2 py-1 text-xs font-medium outline-none",
                            progressColors[pKey] || progressColors.proses_edit
                          )}
                        >
                          {PROGRESS_OPTIONS.map((opt) => {
                            const key = opt.toLowerCase().replace(/\s+/g, "_");
                            return (
                              <option key={opt} value={key}>
                                {opt}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((p) => {
              const pKey = getProgressKey(p.progress);
              return (
                <div key={p.id} className="card p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{p.client?.name || "-"}</h3>
                      <p className="text-xs text-muted">
                        {formatDate(p.month + "-01", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                    <span className={cn("badge", progressColors[pKey] || progressColors.proses_edit)}>
                      {progressLabels[pKey] || p.progress || "Proses Edit"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {p.pilar && (
                      <div>
                        <span className="text-muted">Pilar:</span>{" "}
                        <span className="font-medium text-foreground">{p.pilar}</span>
                      </div>
                    )}
                    {p.konten && (
                      <div>
                        <span className="text-muted">Konten:</span>{" "}
                        <span className="font-medium text-foreground">{p.konten}</span>
                      </div>
                    )}
                    {p.tanggal_upload && (
                      <div>
                        <span className="text-muted">Tgl Upload:</span>{" "}
                        <span className="font-medium text-foreground">{formatDate(p.tanggal_upload)}</span>
                      </div>
                    )}
                  </div>
                  {p.copy && <p className="mt-2 text-sm text-foreground">{p.copy}</p>}
                  {p.details && <p className="mt-1 text-xs text-muted">{p.details}</p>}
                  {p.caption && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted" title={p.caption}>
                      {p.caption}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    {p.link_hasil && (
                      <a
                        href={p.link_hasil}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink size={12} /> Hasil
                      </a>
                    )}
                    {p.reference && (
                      <a
                        href={p.reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink size={12} /> Reference
                      </a>
                    )}
                    <div className="ml-auto flex gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Create/Edit Modal ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "Edit Content Plan" : "Content Plan Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
                {/* Row 1: Client + Bulan */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client *</label>
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Bulan *</label>
                    <input
                      type="month"
                      required
                      value={form.month}
                      onChange={(e) => setForm({ ...form, month: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Row 2: Pilar + Konten */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Pilar</label>
                    <select
                      value={form.pilar}
                      onChange={(e) => setForm({ ...form, pilar: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih Pilar —</option>
                      {PILAR_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Konten</label>
                    <select
                      value={form.konten}
                      onChange={(e) => setForm({ ...form, konten: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih Konten —</option>
                      {KONTEN_OPTIONS.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Copy */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Copy</label>
                  <input
                    type="text"
                    value={form.copy}
                    onChange={(e) => setForm({ ...form, copy: e.target.value })}
                    placeholder="Copy / headline konten..."
                    className="input"
                  />
                </div>

                {/* Row 4: Details */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Details</label>
                  <textarea
                    rows={2}
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    placeholder="Detail konten, brief, atau instruksi..."
                    className="input resize-none"
                  />
                </div>

                {/* Row 5: Reference */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="URL atau referensi konten..."
                    className="input"
                  />
                </div>

                {/* Row 6: Caption */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Caption</label>
                  <textarea
                    rows={3}
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Caption untuk konten..."
                    className="input resize-none"
                  />
                </div>

                {/* Row 7: Link Hasil + Tgl Upload */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Link Hasil</label>
                    <input
                      type="url"
                      value={form.link_hasil}
                      onChange={(e) => setForm({ ...form, link_hasil: e.target.value })}
                      placeholder="https://..."
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tanggal Upload</label>
                    <input
                      type="date"
                      value={form.tanggal_upload}
                      onChange={(e) => setForm({ ...form, tanggal_upload: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Row 8: Progress */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Progress</label>
                  <div className="flex gap-2">
                    {PROGRESS_OPTIONS.map((opt) => {
                      const key = opt.toLowerCase().replace(/\s+/g, "_");
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setForm({ ...form, progress: opt })}
                          className={cn(
                            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            form.progress === opt
                              ? cn(progressColors[key], "ring-2 ring-offset-1 ring-offset-surface")
                              : "bg-background text-muted hover:text-foreground"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground"
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