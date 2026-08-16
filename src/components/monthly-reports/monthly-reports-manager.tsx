"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { toast } from "sonner";
import {
  CalendarClock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { Modal, Card } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface MonthlyReport {
  id: string;
  client_id: string | null;
  task_id: string | null;
  period_month: number;
  period_year: number;
  status: string;
  file_url: string;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client?: { id: string; name: string } | null;
  task?: { id: string; title: string; status: string } | null;
  creator?: { id: string; full_name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  title: string;
  client_id: string | null;
  status: string;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 1 - i);

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string | null) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if (ext === "xls" || ext === "xlsx" || ext === "csv") return FileSpreadsheet;
  return FileText;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function MonthlyReportsManager() {
  const supabase = createClient();

  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    task_id: "",
    period_month: String(new Date().getMonth() + 1),
    period_year: String(CURRENT_YEAR),
    notes: "",
  });
  const [uploading, setUploading] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ===== Data loading =====
  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from("monthly_reports")
      .select(
        `*,
        client:clients(id, name),
        task:tasks(id, title, status),
        creator:profiles!monthly_reports_created_by_fkey(id, full_name)`
      )
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    if (error) {
      toast.error("Gagal memuat monthly reports: " + error.message);
      return;
    }
    setReports((data as unknown as MonthlyReport[]) || []);
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [{ data: clientData }, { data: taskData }] = await Promise.all([
        supabase.from("clients").select("id, name").eq("status", "active").order("name"),
        supabase.from("tasks").select("id, title, client_id, status").neq("status", "done").order("title"),
      ]);
      setClients((clientData as ClientOption[]) || []);
      setTasks((taskData as TaskOption[]) || []);
      await loadReports();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Filters =====
  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (filterClient !== "all" && (r.client_id || "") !== filterClient) return false;
      if (filterYear !== "all" && String(r.period_year) !== filterYear) return false;
      return true;
    });
  }, [reports, filterClient, filterYear]);

  // Tasks yang tersedia untuk dilink (filter by client jika dipilih)
  const availableTasks = useMemo(() => {
    if (!form.client_id) return tasks;
    return tasks.filter((t) => t.client_id === form.client_id || t.client_id === null);
  }, [tasks, form.client_id]);

  // ===== Upload =====
  const handleUpload = async () => {
    if (!file) {
      toast.error("Pilih file report terlebih dahulu");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadFile(file, "monthly-reports");

      const res = await fetch("/api/monthly-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id || null,
          task_id: form.task_id || null,
          period_month: Number(form.period_month),
          period_year: Number(form.period_year),
          file_url: result.publicUrl,
          file_key: result.key,
          file_name: file.name,
          file_size: file.size,
          notes: form.notes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        // Rollback: hapus file yang sudah terupload
        await supabase.storage.from("monthly-reports").remove([result.key]);
        throw new Error(json.error || "Gagal menyimpan report");
      }

      toast.success(
        form.task_id
          ? "Monthly report berhasil diupload & task otomatis diselesaikan ✅"
          : "Monthly report berhasil diupload ✅"
      );
      setUploadOpen(false);
      setFile(null);
      setForm({
        client_id: "",
        task_id: "",
        period_month: String(new Date().getMonth() + 1),
        period_year: String(CURRENT_YEAR),
        notes: "",
      });
      await loadReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload gagal");
    } finally {
      setUploading(false);
    }
  };

  // ===== Delete =====
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/monthly-reports?id=${deleteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menghapus");
      toast.success("Report dihapus");
      setDeleteId(null);
      await loadReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  };

  // ===== Render =====
  const inputCls =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

  // Select: hilangkan arrow default browser, ganti chevron rapi via .select-chevron (globals.css)
  const selectCls = `${inputCls} select-chevron`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Reports"
        subtitle="Upload, kelola, dan download laporan bulanan client"
        actions={
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            Upload Report
          </button>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className={`${selectCls} max-w-xs`}
          >
            <option value="all">Semua Client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className={`${selectCls} max-w-[160px]`}
          >
            <option value="all">Semua Tahun</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
          <div className="ml-auto self-center text-sm text-muted-foreground">
            {filtered.length} report
          </div>
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Belum ada monthly report"
          description="Upload laporan bulanan pertama untuk memulai."
          action={
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Upload Report
            </button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium">Periode</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Task Terkait</th>
                  <th className="px-4 py-3 font-medium">Diupload oleh</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const FileIcon = getFileIcon(r.file_name);
                  return (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {MONTHS[r.period_month - 1]} {r.period_year}
                      </td>
                      <td className="px-4 py-3">{r.client?.name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                          <span className="truncate" title={r.file_name || ""}>
                            {r.file_name || "report"}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({formatFileSize(r.file_size)})
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.task ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <Paperclip className="h-3 w-3" />
                            {r.task.title.length > 30 ? r.task.title.slice(0, 30) + "…" : r.task.title}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{r.creator?.full_name || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <a
                            href={r.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={r.file_name || undefined}
                            title="Download"
                            className="rounded-lg p-2 text-primary hover:bg-primary/10"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => setDeleteId(r.id)}
                            title="Hapus"
                            className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ===== Upload Modal ===== */}
      <Modal
        open={uploadOpen}
        onClose={() => !uploading && setUploadOpen(false)}
        title="Upload Monthly Report"
        subtitle="File akan tersimpan dan bisa didownload oleh tim"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setUploadOpen(false)}
              disabled={uploading}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Batal
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Mengupload…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* File picker */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">File Report *</label>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.ppt,.pptx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatFileSize(file.size)} — klik untuk ganti</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Klik untuk pilih file</span>
                  <span className="text-xs text-muted-foreground">PDF, Excel, Word, PowerPoint (maks ~25MB)</span>
                </>
              )}
            </label>
          </div>

          {/* Client */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Client</label>
            <select
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value, task_id: "" }))}
              className={selectCls}
              disabled={uploading}
            >
              <option value="">— Tanpa client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Periode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Bulan *</label>
              <select
                value={form.period_month}
                onChange={(e) => setForm((f) => ({ ...f, period_month: e.target.value }))}
                className={selectCls}
                disabled={uploading}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tahun *</label>
              <select
                value={form.period_year}
                onChange={(e) => setForm((f) => ({ ...f, period_year: e.target.value }))}
                className={selectCls}
                disabled={uploading}
              >
                {YEARS.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Task link */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Link ke Task (opsional)
            </label>
            <select
              value={form.task_id}
              onChange={(e) => setForm((f) => ({ ...f, task_id: e.target.value }))}
              className={selectCls}
              disabled={uploading}
            >
              <option value="">— Tidak dilink ke task —</option>
              {availableTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Task yang dilink akan otomatis diselesaikan (status: done) setelah report diupload.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputCls} min-h-[72px]`}
              placeholder="Catatan opsional untuk report ini…"
              disabled={uploading}
            />
          </div>
        </div>
      </Modal>

      {/* ===== Confirm Delete ===== */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Hapus Monthly Report?"
        message="File report juga akan dihapus dari storage. Tindakan ini tidak bisa dibatalkan."
        confirmText="Hapus"
        loading={deleting}
      />
    </div>
  );
}