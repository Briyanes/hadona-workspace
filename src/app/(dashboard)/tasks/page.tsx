"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Calendar, Flag, X, AlertCircle } from "lucide-react";
import { formatDate, getInitials, cn } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  division: string | null;
  due_date: string | null;
  client?: { name: string };
  task_assignees?: { user_id: string; user: { full_name: string } }[];
}

interface Client {
  id: string;
  name: string;
}

const COLUMNS = [
  { id: "todo", label: "To Do", color: "border-t-muted" },
  { id: "in_progress", label: "In Progress", color: "border-t-warning" },
  { id: "review", label: "Review", color: "border-t-accent" },
  { id: "done", label: "Done", color: "border-t-success" },
];

const priorityColors: Record<string, string> = {
  low: "text-muted",
  medium: "text-primary",
  high: "text-warning",
  urgent: "text-danger",
};

export default function TasksPage() {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    client_id: "",
    priority: "medium",
    due_date: "",
    status: "todo",
  });

  useEffect(() => {
    loadCurrentUser();
    loadTasks();
    loadClients();

    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  }

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          id, title, description, status, priority, division, due_date,
          client:clients(name),
          task_assignees(user_id, user:profiles(full_name))
        `
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      setTasks((data as unknown as Task[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat tugas: " + msg);
      toast.error("Gagal memuat tugas");
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data, error } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    if (error) {
      toast.error("Gagal memuat daftar client");
      return;
    }
    setClients((data as unknown as Client[]) || []);
  }

  async function updateStatus(taskId: string, newStatus: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ status: newStatus } as never)
      .eq("id", taskId);
    if (error) {
      toast.error("Gagal update status: " + error.message);
    } else {
      toast.success("Task dipindahkan ke " + newStatus.replace("_", " "));
      loadTasks();
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Judul task wajib diisi");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("tasks").insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      client_id: form.client_id || null,
      priority: form.priority,
      status: form.status,
      due_date: form.due_date || null,
      created_by: userData.user?.id,
    } as never);

    if (error) {
      toast.error("Gagal membuat task: " + error.message);
    } else {
      toast.success("Task berhasil dibuat!");
      setForm({ title: "", description: "", client_id: "", priority: "medium", due_date: "", status: "todo" });
      setShowModal(false);
      loadTasks();
    }
    setSaving(false);
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    if (draggedTask) {
      updateStatus(draggedTask, status);
      setDraggedTask(null);
    }
  }

  const visibleTasks = showMyTasksOnly && currentUserId
    ? tasks.filter(
        (t) => t.task_assignees?.some((a) => a.user_id === currentUserId)
      )
    : tasks;

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-64 rounded-lg" />
          ))}
        </div>
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
    <div className="flex h-[calc(100vh-7rem)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Board</h1>
          <p className="text-sm text-muted">Drag & drop untuk memindahkan tugas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium transition-colors",
              showMyTasksOnly
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-white"
            )}
          >
            My Tasks Only
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = visibleTasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={cn(
                "flex flex-col rounded-lg border border-border border-t-4 bg-surface/50",
                col.color
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className="flex items-center justify-between border-b border-border p-3">
                <span className="text-sm font-semibold text-white">{col.label}</span>
                <span className="badge bg-background text-muted">{colTasks.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="cursor-grab rounded-md border border-border bg-background p-3 transition-all hover:border-border-hover active:cursor-grabbing"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      <Flag size={12} className={priorityColors[task.priority] || "text-muted"} />
                    </div>
                    {task.client && <p className="mb-2 text-xs text-muted">{task.client.name}</p>}
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-1.5">
                        {task.task_assignees?.map((a) => (
                          <div
                            key={a.user_id}
                            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface text-[10px] font-semibold text-white"
                            title={a.user?.full_name}
                          >
                            {getInitials(a.user?.full_name)}
                          </div>
                        ))}
                      </div>
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Calendar size={11} />
                          {formatDate(task.due_date, { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border">
                    <p className="text-xs text-muted">Drop tugas di sini</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Buat Task Baru</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Judul Task *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Contoh: Setup Campaign Meta Ads Client X"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Deskripsi</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Detail tugas (opsional)"
                  className="input resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Client</label>
                  <select
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Prioritas</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="input"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Status Awal</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Deadline</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="input"
                  />
                </div>
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
                  {saving ? "Menyimpan..." : "Simpan Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}