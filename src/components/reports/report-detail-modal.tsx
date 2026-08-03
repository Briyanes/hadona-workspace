"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, FileText, Calendar, Edit3, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface ReportDetail {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  summary: string | null;
  client_id: string | null;
  created_at: string;
}

interface ReportDetailModalProps {
  reportId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-muted/20 text-muted" },
  submitted: { label: "Submitted", color: "bg-warning/20 text-warning" },
  approved: { label: "Approved", color: "bg-success/20 text-success" },
  rejected: { label: "Rejected", color: "bg-danger/20 text-danger" },
};

export function ReportDetailModal({ reportId, onClose, onUpdated, onDeleted }: ReportDetailModalProps) {
  const supabase = createClient();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    period_start: "",
    period_end: "",
    status: "draft",
    summary: "",
  });

  useEffect(() => {
    loadReport();
  }, [reportId]);

  async function loadReport() {
    setLoading(true);
    const { data, error } = await supabase
      .from("weekly_reports")
      .select("id, period_start, period_end, status, summary, client_id, created_at")
      .eq("id", reportId)
      .single();

    if (error || !data) {
      toast.error("Gagal memuat report");
      setLoading(false);
      return;
    }

    const r = data as unknown as ReportDetail;
    setReport(r);
    setEditForm({
      period_start: r.period_start || "",
      period_end: r.period_end || "",
      status: r.status || "draft",
      summary: r.summary || "",
    });
    setLoading(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("weekly_reports")
      .update({
        period_start: editForm.period_start || null,
        period_end: editForm.period_end || null,
        status: editForm.status,
        summary: editForm.summary.trim() || null,
      } as never)
      .eq("id", reportId);

    if (error) {
      toast.error("Gagal update report: " + error.message);
    } else {
      toast.success("Report berhasil diupdate!");
      setIsEditing(false);
      loadReport();
      onUpdated?.();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const { error } = await supabase.from("weekly_reports").delete().eq("id", reportId);
    if (error) {
      toast.error("Gagal hapus report: " + error.message);
      setConfirmDelete(false);
      return;
    }
    toast.success("Report berhasil dihapus");
    onDeleted?.();
    onClose();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
        <div className="w-full max-w-lg rounded-none border-border bg-surface p-4 sm:rounded-lg sm:p-6">
          <div className="skeleton h-8 w-3/4 mb-4" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!report) return null;

  const status = statusConfig[report.status] || statusConfig.draft;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-4">
      <div className="relative my-0 flex min-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none border-border bg-surface shadow-xl sm:my-4 sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:border">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{isEditing ? "Edit Report" : "Report Detail"}</h2>
            {!isEditing && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.color)}>
                {status.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <>
                <button onClick={() => setIsEditing(true)} className="rounded p-2 text-muted hover:bg-background hover:text-primary" title="Edit Report">
                  <Edit3 size={16} />
                </button>
                <button onClick={handleDelete} className={cn("rounded p-2 hover:bg-background", confirmDelete ? "text-danger" : "text-muted hover:text-danger")} title="Delete Report">
                  <Trash2 size={16} />
                </button>
                {confirmDelete && (
                  <button onClick={() => setConfirmDelete(false)} className="rounded px-2 py-1 text-xs text-muted hover:text-gray-900">
                    Batal
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="rounded p-2 text-muted hover:bg-background hover:text-gray-900">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Periode Mulai</label>
                  <input type="date" value={editForm.period_start} onChange={(e) => setEditForm({ ...editForm, period_start: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Periode Akhir</label>
                  <input type="date" value={editForm.period_end} onChange={(e) => setEditForm({ ...editForm, period_end: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input">
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Summary</label>
                <textarea rows={5} value={editForm.summary} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} className="input resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-muted hover:text-gray-900">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Period */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-muted" />
                <span className="font-medium text-gray-900">
                  {formatDate(report.period_start, { day: "numeric", month: "long", year: "numeric" })} — {" "}
                  {formatDate(report.period_end, { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                {report.status === "approved" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 w-full">
                    <CheckCircle size={16} className="text-success" />
                    <p className="text-sm font-medium text-success">Report ini sudah di-approve</p>
                  </div>
                ) : report.status === "rejected" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 w-full">
                    <AlertCircle size={16} className="text-danger" />
                    <p className="text-sm font-medium text-danger">Report ditolak, perlu revisi</p>
                  </div>
                ) : null}
              </div>

              {/* Summary */}
              {report.summary ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Summary</p>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.summary}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <FileText size={24} className="mx-auto mb-2 text-muted" />
                  <p className="text-sm text-muted">Belum ada summary</p>
                </div>
              )}

              {/* Created date */}
              <div className="pt-2 text-xs text-muted">
                Dibuat: {formatDate(report.created_at, { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}