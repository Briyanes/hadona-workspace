"use client";

import { createClient } from "@/lib/supabase/client";
import { uploadFile } from "@/lib/upload";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  X,
  Edit3,
  Trash2,
  Calendar,
  Flag,
  MessageCircle,
  CheckSquare,
  Square,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  BarChart3,
  Upload,
  Loader2,
} from "lucide-react";
import { formatDate, timeUntil, getInitials, cn } from "@/lib/utils";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { Avatar } from "@/components/ui/avatar";

interface Task {
  id: string;
  title: string;
  description: string | null;
  result: string | null;
  status: string;
  priority: string;
  division: string | null;
  due_date: string | null;
  start_date: string | null;
  notes: string | null;
  approval_status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  client_id?: string | null;
  client?: { name: string };
  task_assignees?: { user_id: string; user: { full_name: string; avatar_url: string | null } }[];
}

interface Client {
  id: string;
  name: string;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
  user?: { full_name: string; avatar_url: string | null };
}

interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  order_index: number;
}

interface TimeLog {
  id: string;
  hours: number;
  description: string | null;
  date: string;
  billable: boolean;
  user?: { full_name: string; avatar_url: string | null };
}

const statusOptions = [
  { value: "todo", label: "To Do", color: "bg-muted/20 text-muted" },
  { value: "in_progress", label: "In Progress", color: "bg-warning/20 text-warning" },
  { value: "review", label: "Review", color: "bg-accent/20 text-accent" },
  { value: "blocked", label: "Blocked", color: "bg-danger/20 text-danger" },
  { value: "done", label: "Done", color: "bg-success/20 text-success" },
];

const priorityOptions = [
  { value: "low", label: "Low", color: "text-muted" },
  { value: "medium", label: "Medium", color: "text-primary" },
  { value: "high", label: "High", color: "text-warning" },
  { value: "urgent", label: "Urgent", color: "text-danger" },
];

const divisionOptions = [
  "Creative Director",
  "Content Creator",
  "Production",
  "Project Manager",
  "Advertiser",
  "Account Executive",
  "Copywriter",
  "Developer",
];

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface TaskDetailModalProps {
  taskId: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function TaskDetailModal({ taskId, onClose, onUpdated, onDeleted }: TaskDetailModalProps) {
  const supabase = createClient();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // New comment
  const [newComment, setNewComment] = useState("");
  // New subtask
  const [newSubtask, setNewSubtask] = useState("");

  // Edit form
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    division: "",
    due_date: "",
    start_date: "",
    result: "",
    notes: "",
    client_id: "",
  });
  const [editAssignees, setEditAssignees] = useState<string[]>([]);

  // Approval workflow state
  const [approvalNote, setApprovalNote] = useState("");
  const [approving, setApproving] = useState(false);

  // Tab + Time log state
  const [activeTab, setActiveTab] = useState<"comments" | "subtasks" | "timelog">("comments");
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [logTimeForm, setLogTimeForm] = useState({ hours: "", description: "" });
  const [loggingTime, setLoggingTime] = useState(false);
  const [totalLoggedHours, setTotalLoggedHours] = useState(0);

  // Linked monthly report state
  const [linkedReport, setLinkedReport] = useState<{
    id: string;
    file_url: string;
    file_name: string | null;
    period_month: number;
    period_year: number;
  } | null>(null);

  // Load monthly report yang terlink dengan task ini (jika ada)
  const loadLinkedReport = async () => {
    if (!taskId) return;
    const { data } = await supabase
      .from("monthly_reports")
      .select("id, file_url, file_name, period_month, period_year")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1);
    setLinkedReport((data && data[0]) || null);
  };

  // Upload monthly report langsung dari task detail
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportPeriod, setReportPeriod] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [uploadingReport, setUploadingReport] = useState(false);

  async function handleUploadReport() {
    if (!reportFile) {
      toast.error("Pilih file report terlebih dahulu");
      return;
    }
    if (reportFile.size > 50 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 50MB");
      return;
    }
    setUploadingReport(true);
    try {
      // 1. Upload file ke Supabase Storage (bucket monthly-reports)
      const result = await uploadFile(reportFile, "monthly-reports");

      // 2. Simpan metadata + auto-link ke task ini
      const res = await fetch("/api/monthly-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: task?.client_id || null,
          task_id: taskId,
          period_month: reportPeriod.month,
          period_year: reportPeriod.year,
          file_url: result.publicUrl,
          file_key: result.key,
          file_name: reportFile.name,
          file_size: reportFile.size,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        // Rollback: hapus file yang sudah terupload
        await supabase.storage.from("monthly-reports").remove([result.key]);
        throw new Error(json.error || "Gagal menyimpan report");
      }

      toast.success("Monthly report terupload — task dipindah ke Review untuk presentasi ke client ✅");
      setReportFile(null);
      await loadLinkedReport();
      await loadTask();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload gagal");
    } finally {
      setUploadingReport(false);
    }
  }

  useEffect(() => {
    loadTask();
    loadComments();
    loadSubtasks();
    loadClients();
    loadCurrentUser();
    loadTimeLogs();
    loadLinkedReport();

    // Realtime subscriptions
    const commentChannel = supabase
      .channel(`comments-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` }, () => loadComments())
      .subscribe();

    const subtaskChannel = supabase
      .channel(`subtasks-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks", filter: `task_id=eq.${taskId}` }, () => loadSubtasks())
      .subscribe();

    return () => {
      supabase.removeChannel(commentChannel);
      supabase.removeChannel(subtaskChannel);
    };
  }, [taskId]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  }

  async function loadTask() {
    setLoading(true);

    // Step 1: Load ONLY core columns that definitely exist (no approval cols)
    const { data: coreData, error: coreError } = await supabase
      .from("tasks")
      .select("id, title, description, result, status, priority, division, due_date, start_date, notes, client_id")
      .eq("id", taskId)
      .single();

    if (coreError || !coreData) {
      console.error("[Task Detail Load Error]", coreError);
      toast.error("Gagal memuat detail task: " + (coreError?.message || "Task not found"));
      setLoading(false);
      return;
    }

    // Step 2: Try to load approval columns separately (may not exist yet)
    const approvalDefaults = {
      approval_status: null as string | null,
      approved_by: null as string | null,
      approved_at: null as string | null,
      approval_note: null as string | null,
    };
    try {
      const { data: apData, error: apError } = await supabase
        .from("tasks")
        .select("approval_status, approved_by, approved_at, approval_note")
        .eq("id", taskId)
        .single();
      if (!apError && apData) {
        Object.assign(approvalDefaults, apData);
      }
    } catch {
      // Approval columns don't exist — that's OK, continue without them
    }

    // Merge core + approval data
    const core = Object.assign({}, coreData, approvalDefaults) as unknown as Task;

    // Step 3: Load client name + assignees in parallel (non-blocking)
    const [clientResult, assigneesResult] = await Promise.all([
      (coreData as Record<string, unknown>).client_id
        ? supabase.from("clients").select("name").eq("id", (coreData as Record<string, unknown>).client_id as string).single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("task_assignees")
        .select("user_id, user:profiles(full_name, avatar_url)")
        .eq("task_id", taskId),
    ]);

    const taskData: Task = {
      ...core,
      client: (clientResult.data as { name: string } | null) || undefined,
      task_assignees:
        (assigneesResult.data as { user_id: string; user: { full_name: string; avatar_url: string | null } }[] | null) || undefined,
    };

    setTask(taskData);
    setEditForm({
      title: taskData.title || "",
      description: taskData.description || "",
      status: taskData.status || "todo",
      priority: taskData.priority || "medium",
      division: taskData.division || "",
      due_date: taskData.due_date || "",
      start_date: taskData.start_date || "",
      result: taskData.result || "",
      notes: taskData.notes || "",
      client_id: (coreData as Record<string, unknown>).client_id as string || "",
    });
    setEditAssignees(taskData.task_assignees?.map((a) => a.user_id) || []);

    // Smart default: periode report mengikuti deadline task
    if (taskData.due_date) {
      const y = Number(taskData.due_date.slice(0, 4));
      const m = Number(taskData.due_date.slice(5, 7));
      if (y >= 2020 && m >= 1 && m <= 12) {
        setReportPeriod({ month: m, year: y });
      }
    }
    setLoading(false);
  }

  async function loadComments() {
    const { data } = await supabase
      .from("task_comments")
      .select("id, task_id, user_id, comment, created_at, user:profiles(full_name, avatar_url)")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });
    setComments((data as unknown as Comment[]) || []);
  }

  async function loadSubtasks() {
    const { data } = await supabase
      .from("subtasks")
      .select("id, task_id, title, is_completed, order_index")
      .eq("task_id", taskId)
      .order("order_index", { ascending: true });
    setSubtasks((data as unknown as Subtask[]) || []);
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function loadTimeLogs() {
    try {
      const { data, error } = await supabase
        .from("timesheets")
        .select("id, hours, description, date, billable, user:profiles(full_name, avatar_url)")
        .eq("task_id", taskId)
        .order("date", { ascending: false });
      if (error) throw error;
      const logs = (data as unknown as TimeLog[]) || [];
      setTimeLogs(logs);
      setTotalLoggedHours(logs.reduce((sum, l) => sum + l.hours, 0));
    } catch (err) {
      console.error("[loadTimeLogs] Error:", err);
      setTimeLogs([]);
      setTotalLoggedHours(0);
    }
  }

  async function handleLogTime(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !logTimeForm.hours) {
      toast.error("Jam wajib diisi");
      return;
    }
    setLoggingTime(true);

    const { data: taskData } = await supabase
      .from("tasks")
      .select("client_id")
      .eq("id", taskId)
      .single() as { data: { client_id: string | null } | null; error: unknown };

    const insertPayload: Record<string, unknown> = {
      user_id: currentUserId,
      task_id: taskId,
      client_id: taskData?.client_id || null,
      date: new Date().toISOString().split("T")[0],
      hours: parseFloat(logTimeForm.hours),
      activity_type: "general",
      description: logTimeForm.description.trim() || `Worked on: ${task?.title}`,
      billable: true,
    };

    const { error } = await supabase.from("timesheets").insert(insertPayload as never);

    if (error) {
      toast.error("Gagal log time: " + error.message);
    } else {
      toast.success("Time logged!");
      setLogTimeForm({ hours: "", description: "" });
      loadTimeLogs();
      onUpdated();
    }
    setLoggingTime(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.title.trim()) {
      toast.error("Judul task wajib diisi");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        status: editForm.status,
        priority: editForm.priority,
        division: editForm.division || null,
        due_date: editForm.due_date || null,
        start_date: editForm.start_date || null,
        result: editForm.result.trim() || null,
        notes: editForm.notes.trim() || null,
      } as never)
      .eq("id", taskId);

    if (error) {
      toast.error("Gagal update task: " + error.message);
    } else {
      const currentIds = task?.task_assignees?.map((a) => a.user_id) || [];
      const toAdd = editAssignees.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !editAssignees.includes(id));

      if (toRemove.length > 0) {
        await supabase.from("task_assignees").delete().in("user_id", toRemove).eq("task_id", taskId);
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((uid) => ({ task_id: taskId, user_id: uid }));
        await supabase.from("task_assignees").insert(rows as never);
      }

      toast.success("Task berhasil diupdate!");
      setIsEditing(false);
      loadTask();
      onUpdated();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      toast.error("Gagal hapus task: " + error.message);
      setConfirmDelete(false);
      return;
    }
    toast.success("Task berhasil dihapus");
    onDeleted();
    onClose();
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId) return;

    const { error } = await supabase.from("task_comments").insert({
      task_id: taskId,
      user_id: currentUserId,
      comment: newComment.trim(),
    } as never);

    if (error) {
      toast.error("Gagal menambah komentar");
      return;
    }
    setNewComment("");
    loadComments();
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtask.trim() || !currentUserId) return;

    const { error } = await supabase.from("subtasks").insert({
      task_id: taskId,
      title: newSubtask.trim(),
      created_by: currentUserId,
      order_index: subtasks.length,
    } as never);

    if (error) {
      toast.error("Gagal menambah subtask");
      return;
    }
    setNewSubtask("");
    loadSubtasks();
  }

  async function toggleSubtask(id: string, current: boolean) {
    const { error } = await supabase.from("subtasks").update({ is_completed: !current } as never).eq("id", id);
    if (error) {
      toast.error("Gagal update subtask");
      return;
    }
    loadSubtasks();
  }

  async function deleteSubtask(id: string) {
    const { error } = await supabase.from("subtasks").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus subtask");
      return;
    }
    loadSubtasks();
  }

  async function handleApproval(action: "approved" | "rejected" | "changes_requested") {
    if (!currentUserId) return;
    setApproving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        approval_status: action,
        approved_by: currentUserId,
        approved_at: new Date().toISOString(),
        approval_note: approvalNote.trim() || null,
      } as never)
      .eq("id", taskId);

    if (error) {
      toast.error("Gagal update approval: " + error.message);
    } else {
      toast.success(
        action === "approved" ? "Task approved!" :
        action === "rejected" ? "Task ditolak" :
        "Changes requested"
      );
      setApprovalNote("");
      loadTask();
      onUpdated();
    }
    setApproving(false);
  }

  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task?.due_date && task.due_date < today && task.status !== "done";
  const completedSubtasks = subtasks.filter((s) => s.is_completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-0 sm:p-4">
        <div className="w-full max-w-2xl rounded-none border-border bg-surface p-4 sm:rounded-lg sm:p-6">
          <div className="skeleton h-8 w-3/4 mb-4" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-4 w-2/3 mb-2" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-4">
      <div className="relative my-0 flex min-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border-border bg-surface shadow-xl sm:my-4 sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:border">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">{isEditing ? "Edit Task" : "Task Detail"}</h2>
            {!isEditing && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusOptions.find((s) => s.value === task.status)?.color)}>
                {statusOptions.find((s) => s.value === task.status)?.label}
              </span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1 rounded-full bg-danger/20 px-2 py-0.5 text-xs font-medium text-danger">
                <AlertTriangle size={11} /> Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <>
                <button onClick={() => setIsEditing(true)} className="rounded p-2 text-muted hover:bg-background hover:text-primary" title="Edit Task">
                  <Edit3 size={16} />
                </button>
                <button onClick={handleDelete} className={cn("rounded p-2 hover:bg-background", confirmDelete ? "text-danger" : "text-muted hover:text-danger")} title="Delete Task">
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
            /* ==================== EDIT MODE ==================== */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Judul Task *</label>
                <input type="text" required autoFocus value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Deskripsi</label>
                <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="input resize-none" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input">
                    {statusOptions.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Prioritas</label>
                  <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} className="input">
                    {priorityOptions.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Divisi</label>
                <select value={editForm.division} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })} className="input">
                  <option value="">— Pilih Divisi —</option>
                  {divisionOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Start Date</label>
                  <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Deadline</label>
                  <input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="input" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Result / Output</label>
                <input type="text" value={editForm.result} onChange={(e) => setEditForm({ ...editForm, result: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Notes</label>
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="input resize-none" />
              </div>

              {/* Assignees in edit mode - scoped by division */}
              <AssigneePicker
                selectedIds={editAssignees}
                onChange={setEditAssignees}
                label="Assignee"
                divisionFilter={editForm.division || null}
              />
              {editForm.division && (
                <p className="-mt-2 text-xs text-muted">
                  💡 Assignee difilter berdasarkan divisi <strong>{editForm.division}</strong>
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
              </div>
            </form>
          ) : (
            /* ==================== VIEW MODE ==================== */
            <div className="space-y-5">
              {/* Title & Client */}
              <div>
                <h3 className="text-xl font-bold text-foreground">{task.title}</h3>
                {task.client && <p className="mt-0.5 text-sm text-muted">{task.client.name}</p>}
              </div>

              {task.description && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Deskripsi</p>
                  <p className="text-sm text-muted whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Meta Info Grid */}
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted">Prioritas</p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-sm font-medium", priorityOptions.find((p) => p.value === task.priority)?.color)}>
                    <Flag size={12} /> {priorityOptions.find((p) => p.value === task.priority)?.label || task.priority}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Divisi</p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{task.division || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Start Date</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
                    <Calendar size={12} /> {task.start_date ? formatDate(task.start_date, { day: "numeric", month: "short" }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Deadline</p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-sm font-medium", isOverdue ? "text-danger" : "text-foreground")}>
                    <Clock size={12} /> {task.due_date ? formatDate(task.due_date, { day: "numeric", month: "short" }) : "—"}
                  </p>
                </div>
              </div>

              {/* Assignees */}
              {task.task_assignees && task.task_assignees.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Assignees</p>
                  <div className="flex flex-wrap gap-2">
                    {task.task_assignees.map((a) => (
                      <div key={a.user_id} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1">
                        {a.user?.avatar_url ? (
                          <Avatar src={a.user.avatar_url} name={a.user?.full_name} size={24} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-foreground">
                            {getInitials(a.user?.full_name)}
                          </div>
                        )}
                        <span className="text-xs text-foreground">{a.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result & Notes */}
              {(task.result || task.notes) && (
                <div className="grid grid-cols-1 gap-3">
                  {task.result && (
                    <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-success">Result / Output</p>
                      <p className="text-sm text-muted">{task.result}</p>
                    </div>
                  )}
                  {task.notes && (
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="mb-1 text-xs font-semibold text-muted">Notes</p>
                      <p className="text-sm text-muted">{task.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Monthly Report: download jika sudah ada, upload jika belum */}
              {linkedReport ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 size={16} className="text-primary" />
                      <div>
                        <p className="text-xs font-semibold text-primary">Monthly Report Terlampir</p>
                        <p className="text-xs text-muted">
                          Periode{" "}
                          {new Date(linkedReport.period_year, linkedReport.period_month - 1).toLocaleDateString(
                            "id-ID",
                            { month: "long", year: "numeric" }
                          )}
                        </p>
                      </div>
                    </div>
                    <a
                      href={linkedReport.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={linkedReport.file_name || undefined}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      <Download size={13} />
                      Download Report
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-background p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <BarChart3 size={16} className="text-primary" />
                    <p className="text-xs font-semibold text-foreground">Upload Monthly Report</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={reportPeriod.month}
                      onChange={(e) => setReportPeriod({ ...reportPeriod, month: Number(e.target.value) })}
                      className="input text-xs"
                      disabled={uploadingReport}
                    >
                      {monthNames.map((name, idx) => (
                        <option key={name} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={reportPeriod.year}
                      onChange={(e) => setReportPeriod({ ...reportPeriod, year: Number(e.target.value) })}
                      className="input text-xs"
                      disabled={uploadingReport}
                    >
                      {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="file"
                      accept=".pdf,.xlsx,.xls,.doc,.docx,.ppt,.pptx,.csv"
                      onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                      className="input flex-1 p-1.5 text-xs"
                      disabled={uploadingReport}
                    />
                    <button
                      onClick={handleUploadReport}
                      disabled={uploadingReport || !reportFile}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {uploadingReport ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Mengupload…
                        </>
                      ) : (
                        <>
                          <Upload size={13} /> Upload
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted">
                    Setelah upload, task pindah ke Review. PM/AE bisa download report dari sini, setup meeting ke client, lalu tandai Done setelah presentasi.
                  </p>
                </div>
              )}

              {/* Approval Workflow Section */}
              {task.status === "review" && (
                <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FileText size={16} className="text-accent" />
                    <h4 className="text-sm font-semibold text-foreground">Approval Workflow</h4>
                    {task.approval_status && task.approval_status !== "pending" && (
                      <span className={cn(
                        "ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        task.approval_status === "approved" && "bg-success/20 text-success",
                        task.approval_status === "rejected" && "bg-danger/20 text-danger",
                        task.approval_status === "changes_requested" && "bg-warning/20 text-warning"
                      )}>
                        {task.approval_status === "approved" && <CheckCircle2 size={11} />}
                        {task.approval_status === "rejected" && <XCircle size={11} />}
                        {task.approval_status?.replace("_", " ")}
                      </span>
                    )}
                  </div>

                  {task.approval_status === "approved" ? (
                    <p className="text-sm text-muted">
                      ✅ Task ini sudah di-approve
                      {task.approved_at && ` pada ${formatDate(task.approved_at, { day: "numeric", month: "short", year: "numeric" })}`}
                    </p>
                  ) : task.approval_status === "rejected" ? (
                    <p className="text-sm text-danger">❌ Task ditolak. Silakan revisi dan resubmit.</p>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted">Catatan / Feedback (opsional)</label>
                        <textarea
                          rows={2}
                          value={approvalNote}
                          onChange={(e) => setApprovalNote(e.target.value)}
                          placeholder="Tulis catatan untuk approver..."
                          className="input resize-none text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                        <button
                          onClick={() => handleApproval("approved")}
                          disabled={approving}
                          className="flex items-center justify-center gap-1.5 rounded-md bg-success px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button
                          onClick={() => handleApproval("changes_requested")}
                          disabled={approving}
                          className="flex items-center justify-center gap-1.5 rounded-md bg-warning px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
                        >
                          <AlertTriangle size={14} /> Request Changes
                        </button>
                        <button
                          onClick={() => handleApproval("rejected")}
                          disabled={approving}
                          className="flex items-center justify-center gap-1.5 rounded-md bg-danger px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {task.approval_note && (
                    <div className="mt-3 rounded-md border border-border bg-background p-2">
                      <p className="text-xs text-muted">Approval Note:</p>
                      <p className="mt-0.5 text-sm text-muted">{task.approval_note}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Subtask Progress Bar */}
              {subtasks.length > 0 && (
                <div className="rounded-lg border border-border bg-background p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted">Subtask Progress</span>
                    <span className="text-xs text-muted">{completedSubtasks}/{subtasks.length}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${subtaskProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Tabs: Comments, Subtasks & Time Log */}
              <div>
                <div className="mb-3 flex gap-0.5 overflow-x-auto border-b border-border sm:gap-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <button
                    onClick={() => setActiveTab("comments")}
                    className={cn("flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm", activeTab === "comments" ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]" : "border-transparent text-muted hover:text-foreground")}
                  >
                    <MessageCircle size={13} /> <span className="hidden xs:inline sm:inline">Comments</span> ({comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("subtasks")}
                    className={cn("flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm", activeTab === "subtasks" ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]" : "border-transparent text-muted hover:text-foreground")}
                  >
                    <CheckSquare size={13} /> <span className="hidden xs:inline sm:inline">Subtasks</span> ({subtasks.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("timelog")}
                    className={cn("flex shrink-0 items-center gap-1 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:text-sm", activeTab === "timelog" ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]" : "border-transparent text-muted hover:text-foreground")}
                  >
                    <Clock size={13} /> <span className="hidden xs:inline sm:inline">Time</span> ({totalLoggedHours.toFixed(1)}h)
                  </button>
                </div>

                {/* Comments Tab */}
                {activeTab === "comments" && (
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted">Belum ada komentar</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="flex gap-2">
                          {c.user?.avatar_url ? (
                            <Avatar src={c.user.avatar_url} name={c.user?.full_name} size={28} referrerPolicy="no-referrer" />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-foreground">
                              {getInitials(c.user?.full_name)}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="rounded-lg border border-border bg-background p-2.5">
                              <div className="mb-0.5 flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground">{c.user?.full_name || "Unknown"}</span>
                                <span className="text-[10px] text-muted">{timeUntil(c.created_at)}</span>
                              </div>
                              <p className="text-sm text-muted">{c.comment}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <form onSubmit={handleAddComment} className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Tulis komentar..."
                        className="input flex-1"
                      />
                      <button type="submit" disabled={!newComment.trim()} className="btn-primary px-3">
                        <MessageCircle size={14} />
                      </button>
                    </form>
                  </div>
                )}

                {/* Subtasks Tab */}
                {activeTab === "subtasks" && (
                  <div className="space-y-2">
                    {subtasks.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted">Belum ada subtask</p>
                    ) : (
                      subtasks.map((s) => (
                        <div key={s.id} className="group flex items-center gap-2 rounded-lg border border-border bg-background p-2.5">
                          <button onClick={() => toggleSubtask(s.id, s.is_completed)} className="shrink-0">
                            {s.is_completed ? (
                              <CheckSquare size={16} className="text-success" />
                            ) : (
                              <Square size={16} className="text-muted hover:text-foreground" />
                            )}
                          </button>
                          <span className={cn("flex-1 text-sm", s.is_completed ? "text-muted line-through" : "text-foreground")}>
                            {s.title}
                          </span>
                          <button onClick={() => deleteSubtask(s.id)} className="opacity-0 transition-opacity group-hover:opacity-100">
                            <X size={14} className="text-muted hover:text-danger" />
                          </button>
                        </div>
                      ))
                    )}
                    <form onSubmit={handleAddSubtask} className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        placeholder="Tambah subtask..."
                        className="input flex-1"
                      />
                      <button type="submit" disabled={!newSubtask.trim()} className="btn-primary px-3">
                        <Plus size={14} />
                      </button>
                    </form>
                  </div>
                )}

                {/* Time Log Tab */}
                {activeTab === "timelog" && (
                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                      <Clock size={16} className="text-primary" />
                      <div className="flex-1">
                        <p className="text-xs text-muted">Total Time Logged</p>
                        <p className="text-sm font-bold text-foreground">{totalLoggedHours.toFixed(1)} hours</p>
                      </div>
                    </div>

                    {/* Log List */}
                    {timeLogs.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted">Belum ada time log</p>
                    ) : (
                      timeLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                            {log.hours}h
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-foreground">{log.user?.full_name || "Unknown"}</span>
                              <span className="text-[10px] text-muted">{formatDate(log.date, { day: "numeric", month: "short" })}</span>
                              {log.billable && <span className="badge bg-success/10 text-success text-[10px]">Billable</span>}
                            </div>
                            {log.description && (
                              <p className="mt-0.5 text-xs text-muted">{log.description}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Quick Log Form */}
                    <form onSubmit={handleLogTime} className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary">Quick Log Time</p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            required
                            value={logTimeForm.hours}
                            onChange={(e) => setLogTimeForm({ ...logTimeForm, hours: e.target.value })}
                            placeholder="2.5"
                            className="input w-20 sm:w-24"
                          />
                          <input
                            type="text"
                            value={logTimeForm.description}
                            onChange={(e) => setLogTimeForm({ ...logTimeForm, description: e.target.value })}
                            placeholder="Deskripsi..."
                            className="input flex-1"
                          />
                        </div>
                        <button type="submit" disabled={loggingTime} className="btn-primary px-3 whitespace-nowrap sm:self-start">
                          {loggingTime ? "..." : "Log Time"}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted">Jam langsung tercatat di Timesheet & terhubung ke task ini</p>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}