"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Search, X, Clock, CheckCircle, XCircle, AlertCircle,
  FileText, MoreVertical, Pencil, Trash2, Loader2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { LoadMore } from "@/components/ui/load-more";
import { Modal } from "@/components/ui/modal";

interface Approval {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  client_id: string | null;
  content_url: string | null;
  submitted_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  due_date: string | null;
  priority: string;
  created_at: string;
  client_name?: string | null;
  submitter_name?: string | null;
  reviewer_name?: string | null;
}

interface Client {
  id: string;
  name: string;
}

const TYPES = [
  { value: "creative_content", label: "Creative Content", color: "badge bg-primary/20 text-primary" },
  { value: "copy_caption", label: "Copy / Caption", color: "badge bg-purple-100 text-purple-700" },
  { value: "ad_creative", label: "Ad Creative", color: "badge bg-amber-100 text-amber-700" },
  { value: "report", label: "Report", color: "badge bg-cyan-100 text-cyan-700" },
  { value: "other", label: "Other", color: "badge bg-surface text-muted" },
] as const;

const STATUSES = [
  { value: "pending", label: "Pending", color: "badge bg-warning/20 text-warning", icon: Clock },
  { value: "approved", label: "Approved", color: "badge bg-success/20 text-success", icon: CheckCircle },
  { value: "rejected", label: "Rejected", color: "badge bg-danger/20 text-danger", icon: XCircle },
  { value: "changes_requested", label: "Changes Requested", color: "badge bg-primary/20 text-primary", icon: AlertCircle },
] as const;

const PRIORITIES: Record<string, string> = {
  low: "badge bg-surface text-muted",
  medium: "badge bg-primary/10 text-primary",
  high: "badge bg-warning/20 text-warning",
  urgent: "badge bg-danger/20 text-danger",
};

const emptyForm = {
  title: "",
  description: "",
  type: "creative_content",
  client_id: "",
  content_url: "",
  due_date: "",
  priority: "medium",
};

export default function ApprovalsPage() {
  const supabase = createClient();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; action: "approved" | "rejected" | "changes_requested" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [{ data: approvalData, error: err1 }, { data: clientData, error: err2 }, { data: profileData }] = await Promise.all([
        supabase.from("approval_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("profiles").select("id, full_name"),
      ]);

      if (err1) throw err1;
      if (err2) throw err2;

      const profileMap = new Map((profileData || []).map((p: any) => [p.id, p.full_name]));
      const clientMap = new Map((clientData || []).map((c: any) => [c.id, c.name]));

      const enriched = (approvalData || []).map((a: any) => ({
        ...a,
        client_name: a.client_id ? clientMap.get(a.client_id) : null,
        submitter_name: profileMap.get(a.submitted_by),
        reviewer_name: a.reviewed_by ? profileMap.get(a.reviewed_by) : null,
      }));

      setApprovals(enriched);
      setClients((clientData as unknown as Client[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat approval requests: " + msg);
      toast.error("Gagal memuat data approval");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return approvals.filter((a) => {
      const matchSearch = !search || a.title?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [approvals, search, statusFilter]);

  // Load More pagination — pattern konsisten dengan clients/reports page
  const { visibleItems, loadMore, hasMore, remaining } = useIncrementalList(filtered, {
    resetKey: `${search}|${statusFilter}`,
  });

  const stats = useMemo(() => {
    const total = approvals.length;
    const statusCounts: Record<string, number> = {};
    for (const s of STATUSES) {
      statusCounts[s.value] = approvals.filter((a) => a.status === s.value).length;
    }
    const overdue = approvals.filter(
      (a) => a.status === "pending" && a.due_date && new Date(a.due_date) < new Date()
    ).length;
    return { total, statusCounts, overdue };
  }, [approvals]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(a: Approval) {
    setForm({
      title: a.title,
      description: a.description || "",
      type: a.type,
      client_id: a.client_id || "",
      content_url: a.content_url || "",
      due_date: a.due_date ? a.due_date.split("T")[0] : "",
      priority: a.priority || "medium",
    });
    setEditingId(a.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Title wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type,
        client_id: form.client_id || null,
        content_url: form.content_url.trim() || null,
        due_date: form.due_date || null,
        priority: form.priority,
        ...(editingId ? {} : { submitted_by: user?.id, status: "pending" }),
      };

      if (editingId) {
        const { error: err } = await supabase.from("approval_requests").update(payload as never).eq("id", editingId);
        if (err) throw err;
        toast.success("Approval request diupdate!");
      } else {
        const { error: err } = await supabase.from("approval_requests").insert(payload as never);
        if (err) throw err;
        toast.success("Approval request dibuat!");
      }

      setShowModal(false);
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      else if (err instanceof Error) msg = err.message;
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error: err } = await supabase.from("approval_requests").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Approval request dihapus");
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleReview() {
    if (!reviewTarget) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from("approval_requests")
        .update({
          status: reviewTarget.action,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes.trim() || null,
        } as never)
        .eq("id", reviewTarget.id);
      if (err) throw err;
      toast.success(`Request ${reviewTarget.action.replace("_", " ")}`);
      setReviewTarget(null);
      setReviewNotes("");
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal: " + msg);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Approvals</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-4">Coba Lagi</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Workflow"
        subtitle="Review dan approve creative content, copy, dan ad creatives"
        actions={
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Request
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <Clock className="mb-2 text-warning" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.statusCounts.pending || 0}</p>
          <p className="text-xs text-muted">Pending</p>
        </div>
        <div className="card p-4">
          <CheckCircle className="mb-2 text-success" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.statusCounts.approved || 0}</p>
          <p className="text-xs text-muted">Approved</p>
        </div>
        <div className="card p-4">
          <XCircle className="mb-2 text-danger" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.statusCounts.rejected || 0}</p>
          <p className="text-xs text-muted">Rejected</p>
        </div>
        <div className="card p-4">
          <AlertCircle className={cn("mb-2", stats.overdue > 0 ? "text-danger" : "text-muted")} size={18} />
          <p className={cn("text-2xl font-bold", stats.overdue > 0 ? "text-danger" : "text-muted")}>{stats.overdue}</p>
          <p className="text-xs text-muted">Overdue</p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                statusFilter === s.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:text-foreground"
              )}
            >
              <Icon size={12} /> {s.label}
              <span className="rounded-full bg-background px-1.5 text-[10px] text-muted">
                {stats.statusCounts[s.value] || 0}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
            statusFilter === "all"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          All ({stats.total})
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input
          type="text"
          placeholder="Cari approval request..."
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada approval request</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Buat Request Pertama
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((a) => {
            const status = STATUSES.find((s) => s.value === a.status);
            const type = TYPES.find((t) => t.value === a.type);
            const isOverdue = a.status === "pending" && a.due_date && new Date(a.due_date) < new Date();
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                      <span className={cn(type?.color)}>{type?.label}</span>
                      <span className={cn(status?.color)}>{status?.label}</span>
                      <span className={cn(PRIORITIES[a.priority] || PRIORITIES.medium)}>{a.priority}</span>
                      {isOverdue && (
                        <span className="badge bg-danger/20 text-danger animate-pulse">⚠ OVERDUE</span>
                      )}
                    </div>
                    {a.description && <p className="text-sm text-muted">{a.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted">
                      {a.client_name && <span>🏢 {a.client_name}</span>}
                      {a.submitter_name && <span>👤 {a.submitter_name}</span>}
                      {a.reviewer_name && <span>✅ Reviewed by: {a.reviewer_name}</span>}
                      {a.due_date && (
                        <span className={isOverdue ? "font-bold text-danger" : ""}>
                          📅 Due: {new Date(a.due_date).toLocaleDateString("id-ID")}
                        </span>
                      )}
                      <span>🕐 {new Date(a.created_at).toLocaleDateString("id-ID")}</span>
                    </div>
                    {a.review_notes && (
                      <div className="mt-2 rounded-md bg-background p-2 text-xs text-muted">
                        <strong>Review Notes:</strong> {a.review_notes}
                      </div>
                    )}
                    {a.content_url && (
                      <a
                        href={a.content_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink size={10} /> View Content
                      </a>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Quick approve/reject for pending items */}
                    {a.status === "pending" && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setReviewTarget({ id: a.id, action: "approved" }); setReviewNotes(""); }}
                          className="rounded p-2 text-success transition-colors hover:bg-success/10"
                          title="Approve"
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => { setReviewTarget({ id: a.id, action: "changes_requested" }); setReviewNotes(""); }}
                          className="rounded p-2 text-primary transition-colors hover:bg-primary/10"
                          title="Request Changes"
                        >
                          <AlertCircle size={16} />
                        </button>
                        <button
                          onClick={() => { setReviewTarget({ id: a.id, action: "rejected" }); setReviewNotes(""); }}
                          className="rounded p-2 text-danger transition-colors hover:bg-danger/10"
                          title="Reject"
                        >
                          <XCircle size={16} />
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === a.id ? null : a.id)}
                        className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {menuOpenId === a.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                            <button
                              onClick={() => { openEdit(a); setMenuOpenId(null); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-primary/5"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => { setDeleteTarget({ id: a.id, title: a.title }); setMenuOpenId(null); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-danger/5"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <LoadMore
            hasMore={hasMore}
            onLoadMore={loadMore}
            remaining={remaining}
            visibleCount={visibleItems.length}
            totalCount={filtered.length}
            itemLabel="approvals"
          />
        </div>
      )}

      {/* Create/Edit Modal */}
<Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingId ? "Edit Request" : "New Approval Request"}
          size="lg"
          footer={
            <>

                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:bg-background hover:text-foreground">
                  Cancel
                </button>
                <button type="submit" form="approval-form" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
                          </>
          }
        >
          <form id="approval-form" onSubmit={handleSave}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Title <span className="text-danger">*</span></label>
                  <input
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="Video Iklan Bulan Ramadhan - Final Cut"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input py-2 text-sm">
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Client</label>
                  <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="input py-2 text-sm">
                    <option value="">— No Client —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Due Date</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input py-2 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Content URL</label>
                  <input
                    value={form.content_url}
                    onChange={(e) => setForm({ ...form, content_url: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="Detail tentang request ini..."
                  />
                </div>
              </div>
              </form>
        </Modal>

      {/* Review Dialog */}
      <Modal
        open={!!reviewTarget}
        onClose={() => { setReviewTarget(null); setReviewNotes(""); }}
        title={reviewTarget?.action === "approved" ? "✅ Approve" : reviewTarget?.action === "rejected" ? "❌ Reject" : "📝 Request Changes"}
        size="sm"
        footer={
          <>
            <button onClick={() => { setReviewTarget(null); setReviewNotes(""); }} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:bg-background">
              Cancel
            </button>
            <button
              onClick={handleReview}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium text-white",
                reviewTarget?.action === "approved" ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"
              )}
            >
              Confirm
            </button>
          </>
        }
      >
        {reviewTarget && (
          <>
            <p className="mb-3 text-sm text-muted">
              {reviewTarget.action === "approved"
                ? "Setujui request ini. Client akan diberi tahu."
                : reviewTarget.action === "rejected"
                ? "Tolak request ini. Berikan alasan yang jelas."
                : "Minta perubahan. Jelaskan apa yang perlu diperbaiki."}
            </p>
            <textarea
              rows={4}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="input py-2 text-sm"
              placeholder="Review notes (opsional untuk approve, wajib untuk reject/changes)..."
            />
          </>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Approval Request?"
        message={`Yakin ingin menghapus "${deleteTarget?.title}"?`}
        confirmText="Hapus"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}