"use client";

import { createClient } from "@/lib/supabase/client";
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
} from "lucide-react";
import { formatDate, timeUntil, getInitials, cn } from "@/lib/utils";

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
  client?: { name: string };
  task_assignees?: { user_id: string; user: { full_name: string } }[];
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
  user?: { full_name: string };
}

interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  order_index: number;
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
  "Creative", "Advertising", "Social Media Management", "SEO", "Strategy", "Operations",
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

  const [activeTab, setActiveTab] = useState<"comments" | "subtasks">("comments");

  useEffect(() => {
    loadTask();
    loadComments();
    loadSubtasks();
    loadClients();
    loadCurrentUser();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  }

  async function loadTask() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select(`id, title, description, result, status, priority, division, due_date, start_date, notes, client:clients(name), task_assignees(user_id, user:profiles(full_name))`)
      .eq("id", taskId)
      .single();

    if (error) {
      toast.error("Gagal memuat detail task");
      setLoading(false);
      return;
    }

    const taskData = data as unknown as Task;
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
      client_id: "",
    });
    setLoading(false);
  }

  async function loadComments() {
    const { data } = await supabase
      .from("task_comments")
      .select("id, task_id, user_id, comment, created_at, user:profiles(full_name)")
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

  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task?.due_date && task.due_date < today && task.status !== "done";
  const completedSubtasks = subtasks.filter((s) => s.is_completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative my-8 w-full max-w-2xl rounded-lg border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{isEditing ? "Edit Task" : "Task Detail"}</h2>
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
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-4">
          {isEditing ? (
            /* ==================== EDIT MODE ==================== */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Judul Task *</label>
                <input type="text" required autoFocus value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Deskripsi</label>
                <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="input resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="input">
                    {statusOptions.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Prioritas</label>
                  <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })} className="input">
                    {priorityOptions.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Divisi</label>
                <select value={editForm.division} onChange={(e) => setEditForm({ ...editForm, division: e.target.value })} className="input">
                  <option value="">— Pilih Divisi —</option>
                  {divisionOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Start Date</label>
                  <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Deadline</label>
                  <input type="date" value={editForm.due_date} onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })} className="input" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Result / Output</label>
                <input type="text" value={editForm.result} onChange={(e) => setEditForm({ ...editForm, result: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Notes</label>
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="input resize-none" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-muted hover:text-gray-900">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
              </div>
            </form>
          ) : (
            /* ==================== VIEW MODE ==================== */
            <div className="space-y-5">
              {/* Title & Client */}
              <div>
                <h3 className="text-xl font-bold text-gray-900">{task.title}</h3>
                {task.client && <p className="mt-0.5 text-sm text-muted">{task.client.name}</p>}
              </div>

              {task.description && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Deskripsi</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Meta Info Grid */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background p-4 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted">Prioritas</p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-sm font-medium", priorityOptions.find((p) => p.value === task.priority)?.color)}>
                    <Flag size={12} /> {priorityOptions.find((p) => p.value === task.priority)?.label || task.priority}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Divisi</p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900">{task.division || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Start Date</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-900">
                    <Calendar size={12} /> {task.start_date ? formatDate(task.start_date, { day: "numeric", month: "short" }) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Deadline</p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-sm font-medium", isOverdue ? "text-danger" : "text-gray-900")}>
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
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-gray-900">
                          {getInitials(a.user?.full_name)}
                        </div>
                        <span className="text-xs text-gray-900">{a.user?.full_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result & Notes */}
              {(task.result || task.notes) && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {task.result && (
                    <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                      <p className="mb-1 text-xs font-semibold text-success">Result / Output</p>
                      <p className="text-sm text-gray-700">{task.result}</p>
                    </div>
                  )}
                  {task.notes && (
                    <div className="rounded-lg border border-border bg-background p-3">
                      <p className="mb-1 text-xs font-semibold text-muted">Notes</p>
                      <p className="text-sm text-gray-700">{task.notes}</p>
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

              {/* Tabs: Comments & Subtasks */}
              <div>
                <div className="mb-3 flex gap-1 border-b border-border">
                  <button
                    onClick={() => setActiveTab("comments")}
                    className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors", activeTab === "comments" ? "border-primary text-primary" : "border-transparent text-muted hover:text-gray-900")}
                  >
                    <MessageCircle size={14} /> Comments ({comments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("subtasks")}
                    className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors", activeTab === "subtasks" ? "border-primary text-primary" : "border-transparent text-muted hover:text-gray-900")}
                  >
                    <CheckSquare size={14} /> Subtasks ({subtasks.length})
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
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-gray-900">
                            {getInitials(c.user?.full_name)}
                          </div>
                          <div className="flex-1">
                            <div className="rounded-lg border border-border bg-background p-2.5">
                              <div className="mb-0.5 flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-900">{c.user?.full_name || "Unknown"}</span>
                                <span className="text-[10px] text-muted">{timeUntil(c.created_at)}</span>
                              </div>
                              <p className="text-sm text-gray-700">{c.comment}</p>
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
                              <Square size={16} className="text-muted hover:text-gray-900" />
                            )}
                          </button>
                          <span className={cn("flex-1 text-sm", s.is_completed ? "text-muted line-through" : "text-gray-900")}>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}