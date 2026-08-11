"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, FileText, Calendar, Edit3, Trash2, CheckCircle, AlertCircle, ExternalLink, Database, Clock, AlertTriangle } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface ReportDetail {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  summary: string | null;
  client_id: string | null;
  created_at: string;
  // 🆕 P4: Sheet source tracking fields
  source_sheet_url?: string | null;
  sheet_source?: string | null;
  sheet_gid?: string | null;
  last_synced_at?: string | null;
  data_status?: string | null;
  data_source_kind?: string | null;
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
      // 🆕 P4: Include sheet source tracking fields
      .select("id, period_start, period_end, status, summary, client_id, created_at, source_sheet_url, sheet_source, sheet_gid, last_synced_at, data_status, data_source_kind")
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
            <h2 className="text-lg font-bold text-foreground">{isEditing ? "Edit Report" : "Report Detail"}</h2>
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
                  <button onClick={() => setConfirmDelete(false)} className="rounded px-2 py-1 text-xs text-muted hover:text-foreground">
                    Batal
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="rounded p-2 text-muted hover:bg-background hover:text-foreground">
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
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Periode Mulai</label>
                  <input type="date" value={editForm.period_start} onChange={(e) => setEditForm({ ...editForm, period_start: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Periode Akhir</label>
                  <input type="date" value={editForm.period_end} onChange={(e) => setEditForm({ ...editForm, period_end: e.target.value })} className="input" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input">
                  <option value="draft">Draft</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Summary</label>
                <textarea rows={5} value={editForm.summary} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} className="input resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Period */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-muted" />
                <span className="font-medium text-foreground">
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
                    <p className="text-sm text-muted whitespace-pre-wrap">{report.summary}</p>
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

              {/* 🆕 P4: Sheet Source & Data Status Section */}
              {(report.sheet_source || report.data_status || report.last_synced_at) && (
                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    <Database size={12} /> Sumber Data
                  </p>

                  {/* Data status badge */}
                  {report.data_status && report.data_status !== "ok" && (
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-md p-2 text-xs font-medium",
                        report.data_status === "no_metrics" && "bg-warning/10 text-warning",
                        report.data_status === "partial" && "bg-warning/10 text-warning",
                        report.data_status === "synced_error" && "bg-danger/10 text-danger"
                      )}
                    >
                      <AlertTriangle size={12} />
                      <span>
                        {report.data_status === "no_metrics" && "Tidak ada angka metric — narrative only"}
                        {report.data_status === "partial" && "Data tidak lengkap — metric kurang dari 3"}
                        {report.data_status === "synced_error" && "Error saat sync — data mungkin unreliable"}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted">
                    {report.sheet_source && (
                      <p>
                        <span className="font-medium text-muted">Sheet Tab:</span> {report.sheet_source}
                        {report.sheet_gid && <span className="ml-1 font-mono text-muted/70">(gid: {report.sheet_gid})</span>}
                      </p>
                    )}
                    {report.data_source_kind && (
                      <p>
                        <span className="font-medium text-muted">Metode Import:</span>{" "}
                        {report.data_source_kind === "sheet_auto" && "Auto-sync dari Google Sheet"}
                        {report.data_source_kind === "sheet_manual" && "Manual import via tombol Import Sheet"}
                        {report.data_source_kind === "manual_entry" && "Input manual user"}
                      </p>
                    )}
                    {report.last_synced_at && (
                      <p className="flex items-center gap-1">
                        <Clock size={11} />
                        <span>Last sync: {formatDate(report.last_synced_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    )}
                    {report.source_sheet_url && (
                      <a
                        href={report.source_sheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink size={11} />
                        <span>Lihat Google Sheet asal</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}