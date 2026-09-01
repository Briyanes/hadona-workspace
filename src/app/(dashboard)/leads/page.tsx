"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Search, TrendingUp, Phone, Mail, Building2, MoreVertical,
  Target, Trophy, XCircle, Clock, X, Pencil, Trash2, AlertCircle, Loader2,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { LoadMore } from "@/components/ui/load-more";
import { Modal } from "@/components/ui/modal";

// ============================================================
// Types — match DB table "leads" (migration-v79.sql)
// ============================================================
interface Lead {
  id: string;
  company_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  stage: string;
  priority: string;
  source: string | null;
  estimated_value: number;
  actual_value: number;
  expected_close_date: string | null;
  won_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const STAGES = [
  { value: "new", label: "New", color: "badge bg-primary/20 text-primary" },
  { value: "contacted", label: "Contacted", color: "badge bg-cyan-100 text-cyan-700" },
  { value: "qualified", label: "Qualified", color: "badge bg-purple-100 text-purple-700" },
  { value: "proposal_sent", label: "Proposal Sent", color: "badge bg-amber-100 text-amber-700" },
  { value: "negotiation", label: "Negotiation", color: "badge bg-orange-100 text-orange-700" },
  { value: "won", label: "Won", color: "badge bg-success/20 text-success" },
  { value: "lost", label: "Lost", color: "badge bg-danger/20 text-danger" },
] as const;

const PRIORITIES: Record<string, string> = {
  low: "badge bg-surface text-muted",
  medium: "badge bg-primary/10 text-primary",
  high: "badge bg-warning/20 text-warning",
  urgent: "badge bg-danger/20 text-danger",
};

const SOURCES = ["manual", "website", "referral", "social_media", "cold_call", "event", "other"];

const emptyForm = {
  company_name: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  stage: "new",
  priority: "medium",
  source: "manual",
  estimated_value: "",
  actual_value: "",
  expected_close_date: "",
  notes: "",
};

export default function LeadsPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Dropdown menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // ============================================
  // Load leads
  // ============================================
  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    try {
      const { data, error: err } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (err) throw err;
      setLeads((data as unknown as Lead[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat leads: " + msg);
      toast.error("Gagal memuat data leads");
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // Filtered + searched data
  // ============================================
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const matchSearch =
        !search ||
        l.company_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.contact_person?.toLowerCase().includes(search.toLowerCase());
      const matchStage = stageFilter === "all" || l.stage === stageFilter;
      return matchSearch && matchStage;
    });
  }, [leads, search, stageFilter]);

  // Load More pagination — pattern konsisten dengan clients/reports page
  const { visibleItems, loadMore, hasMore, remaining } = useIncrementalList(filtered, {
    resetKey: `${search}|${stageFilter}`,
  });

  // ============================================
  // Stats
  // ============================================
  const stats = useMemo(() => {
    const total = leads.length;
    const stageCounts: Record<string, number> = {};
    for (const s of STAGES) {
      stageCounts[s.value] = leads.filter((l) => l.stage === s.value).length;
    }
    const totalPipeline = leads.reduce((sum, l) => sum + (l.estimated_value || 0), 0);
    const wonValue = leads
      .filter((l) => l.stage === "won")
      .reduce((sum, l) => sum + (l.actual_value || 0), 0);
    const winRate = total > 0 ? Math.round(((stageCounts["won"] || 0) / total) * 100) : 0;
    return { total, stageCounts, totalPipeline, wonValue, winRate };
  }, [leads]);

  // ============================================
  // CRUD helpers
  // ============================================
  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(lead: Lead) {
    setForm({
      company_name: lead.company_name || "",
      contact_person: lead.contact_person || "",
      contact_email: lead.contact_email || "",
      contact_phone: lead.contact_phone || "",
      stage: lead.stage || "new",
      priority: lead.priority || "medium",
      source: lead.source || "manual",
      estimated_value: lead.estimated_value ? String(lead.estimated_value) : "",
      actual_value: lead.actual_value ? String(lead.actual_value) : "",
      expected_close_date: lead.expected_close_date || "",
      notes: lead.notes || "",
    });
    setEditingId(lead.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      toast.error("Nama company wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        company_name: form.company_name.trim(),
        contact_person: form.contact_person.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        stage: form.stage,
        priority: form.priority,
        source: form.source,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : 0,
        actual_value: form.actual_value ? parseFloat(form.actual_value) : 0,
        expected_close_date: form.expected_close_date || null,
        notes: form.notes.trim() || null,
        ...(editingId ? {} : { created_by: user?.id || null }),
        ...(form.stage === "won" && !editingId ? { won_at: new Date().toISOString() } : {}),
      };

      if (editingId) {
        // If transitioning to won, set won_at
        if (form.stage === "won") {
          (payload as Record<string, unknown>).won_at = new Date().toISOString();
        }
        const { error: err } = await supabase.from("leads").update(payload as never).eq("id", editingId);
        if (err) throw err;
        toast.success("Lead berhasil diupdate!");
      } else {
        const { error: err } = await supabase.from("leads").insert(payload as never);
        if (err) throw err;
        toast.success("Lead berhasil dibuat!");
      }

      setShowModal(false);
      loadLeads();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      console.error("[Lead Save Error]", err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error: err } = await supabase.from("leads").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Lead dihapus");
      setDeleteTarget(null);
      loadLeads();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleStageChange(id: string, newStage: string) {
    try {
      const updateData: Record<string, unknown> = { stage: newStage };
      if (newStage === "won") {
        updateData.won_at = new Date().toISOString();
      }
      const { error: err } = await supabase
        .from("leads")
        .update(updateData as never)
        .eq("id", id);
      if (err) throw err;
      toast.success("Stage updated");
      loadLeads();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) {
        msg = String((err as { message: unknown }).message);
      }
      toast.error("Gagal update stage: " + msg);
    }
  }

  // ============================================
  // Render
  // ============================================
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Lead Pipeline</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-lg" />
          ))}
        </div>
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
      {/* Header */}
      <PageHeader
        title="Lead Pipeline"
        subtitle="Track dan kelola prospek sales melalui pipeline"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Lead
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <Target className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted">Total Leads</p>
        </div>
        <div className="card p-4">
          <TrendingUp className="mb-2 text-warning" size={18} />
          <p className="text-lg font-bold text-warning">{formatIDR(stats.totalPipeline)}</p>
          <p className="text-xs text-muted">Pipeline Value</p>
        </div>
        <div className="card p-4">
          <Trophy className="mb-2 text-success" size={18} />
          <p className="text-lg font-bold text-success">{formatIDR(stats.wonValue)}</p>
          <p className="text-xs text-muted">Won Value</p>
        </div>
        <div className="card p-4">
          <Clock className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-primary">{stats.winRate}%</p>
          <p className="text-xs text-muted">Win Rate</p>
        </div>
      </div>

      {/* Stage Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStageFilter("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
            stageFilter === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          All
          <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">{stats.total}</span>
        </button>
        {STAGES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStageFilter(s.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              stageFilter === s.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-muted hover:text-foreground"
            )}
          >
            {s.label}
            <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
              {stats.stageCounts[s.value] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input
          type="text"
          placeholder="Cari company atau contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input py-1.5 pl-8 text-xs"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Target className="mb-3 text-muted" size={32} />
          <p className="text-muted">
            {search || stageFilter !== "all" ? "Tidak ada lead yang cocok" : "Belum ada lead"}
          </p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Tambah Lead Pertama
          </button>
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Priority</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted">Est. Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted">Expected Close</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((lead) => (
                <tr key={lead.id} className="border-b border-border transition-colors last:border-0 hover:bg-primary/5">
                  {/* Company */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="text-muted" size={14} />
                      <div>
                        <p className="font-medium text-foreground">{lead.company_name}</p>
                        {lead.source && (
                          <p className="text-[10px] text-muted capitalize">{lead.source.replace("_", " ")}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Contact */}
                  <td className="px-4 py-3">
                    <p className="text-xs text-foreground">{lead.contact_person || "—"}</p>
                    {lead.contact_phone && (
                      <p className="flex items-center gap-1 text-[10px] text-muted">
                        <Phone size={9} /> {lead.contact_phone}
                      </p>
                    )}
                    {lead.contact_email && (
                      <p className="flex items-center gap-1 text-[10px] text-muted">
                        <Mail size={9} /> {lead.contact_email}
                      </p>
                    )}
                  </td>
                  {/* Stage */}
                  <td className="px-4 py-3">
                    <select
                      value={lead.stage}
                      onChange={(e) => handleStageChange(lead.id, e.target.value)}
                      className={cn(
                        "status-pill cursor-pointer border-0 text-xs font-medium outline-none",
                        STAGES.find((s) => s.value === lead.stage)?.color || ""
                      )}
                    >
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {lead.stage === "won" && lead.won_at && (
                      <p className="mt-0.5 text-[9px] text-success">
                        Won: {new Date(lead.won_at).toLocaleDateString("id-ID")}
                      </p>
                    )}
                  </td>
                  {/* Priority */}
                  <td className="px-4 py-3">
                    <span className={cn(PRIORITIES[lead.priority] || PRIORITIES.medium)}>
                      {lead.priority}
                    </span>
                  </td>
                  {/* Value */}
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-foreground">
                      {formatIDR(lead.estimated_value || 0)}
                    </span>
                    {lead.stage === "won" && lead.actual_value > 0 && (
                      <p className="text-[9px] text-success">Actual: {formatIDR(lead.actual_value)}</p>
                    )}
                  </td>
                  {/* Expected Close */}
                  <td className="px-4 py-3">
                    {lead.expected_close_date ? (
                      <span className="text-xs text-muted">
                        {new Date(lead.expected_close_date).toLocaleDateString("id-ID")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === lead.id ? null : lead.id)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {menuOpenId === lead.id && (
                          <>
                            {/* Click-away overlay */}
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                            <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                              <button
                                onClick={() => {
                                  openEdit(lead);
                                  setMenuOpenId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-primary/5"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                              <button
                                onClick={() => {
                                  setDeleteTarget({ id: lead.id, name: lead.company_name });
                                  setMenuOpenId(null);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-danger/5"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LoadMore
          hasMore={hasMore}
          onLoadMore={loadMore}
          remaining={remaining}
          visibleCount={visibleItems.length}
          totalCount={filtered.length}
          itemLabel="leads"
        />
      </>
      )}

      {/* Create/Edit Modal */}
<Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingId ? "Edit Lead" : "New Lead"}
          size="lg"
          footer={
            <>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
                >
                  Cancel
                </button>
                <button type="submit" form="lead-form" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
                          </>
          }
        >
          <form id="lead-form" onSubmit={handleSave}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Company Name */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Company Name <span className="text-danger">*</span>
                  </label>
                  <input
                    required
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="PT Contoh"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Contact Person</label>
                  <input
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="John Doe"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="john@company.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
                  <input
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>

                {/* Stage */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    className="input py-2 text-sm"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="input py-2 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Source */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Source</label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="input py-2 text-sm"
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Expected Close Date */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Expected Close Date</label>
                  <input
                    type="date"
                    value={form.expected_close_date}
                    onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                    className="input py-2 text-sm"
                  />
                </div>

                {/* Estimated Value */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Estimated Value (Rp)</label>
                  <input
                    type="number"
                    value={form.estimated_value}
                    onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="50000000"
                  />
                </div>

                {/* Actual Value (only show if won) */}
                {form.stage === "won" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Actual Value (Rp)</label>
                    <input
                      type="number"
                      value={form.actual_value}
                      onChange={(e) => setForm({ ...form, actual_value: e.target.value })}
                      className="input py-2 text-sm"
                      placeholder="45000000"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input py-2 text-sm"
                  placeholder="Catatan tentang lead ini..."
                />
              </div>

              {/* Footer Actions */}
              </form>
        </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Lead?"
        message={`Yakin ingin menghapus lead "${deleteTarget?.name}"? Tindakan ini tidak bisa dibatalkan.`}
        confirmText="Hapus"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}