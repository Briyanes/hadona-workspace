"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Plus, Calendar, Flag, X, AlertCircle, AlertTriangle, Search, Filter, LayoutGrid, List } from "lucide-react";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";

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
  { id: "blocked", label: "Blocked", color: "border-t-danger" },
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  // View mode: board or table
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    client_id: "",
    priority: "medium",
    due_date: "",
    status: "todo",
    division: "",
    result: "",
    blocker: "",
    start_date: "",
  });
  const [formAssignees, setFormAssignees] = useState<string[]>([]);

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
      division: form.division.trim() || null,
      result: form.result.trim() || null,
      blocker: form.blocker.trim() || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      created_by: userData.user?.id,
    } as never);

    if (error) {
      toast.error("Gagal membuat task: " + error.message);
    } else {
      // Insert assignees if any selected
      const { data: newTask } = await supabase
        .from("tasks")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (newTask && formAssignees.length > 0) {
        const assigneeRows = formAssignees.map((uid) => ({
          task_id: (newTask as { id: string }).id,
          user_id: uid,
        }));
        await supabase.from("task_assignees").insert(assigneeRows as never);
      }

      toast.success("Task berhasil dibuat!");
      setForm({ title: "", description: "", client_id: "", priority: "medium", due_date: "", status: "todo", division: "", result: "", blocker: "", start_date: "" });
      setFormAssignees([]);
      setShowModal(false);
      loadTasks();
    }
    setSaving(false);
  }

  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    updateStatus(draggableId, destination.droppableId);
  }

  // Apply filters
  const visibleTasks = useMemo(() => {
    let filtered = tasks;

    // My Tasks filter
    if (showMyTasksOnly && currentUserId) {
      filtered = filtered.filter((t) =>
        t.task_assignees?.some((a) => a.user_id === currentUserId)
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.client?.name?.toLowerCase().includes(q)
      );
    }

    // Client filter
    if (filterClient !== "all") {
      filtered = filtered.filter((t) => t.client?.name === filterClient);
    }

    // Priority filter
    if (filterPriority !== "all") {
      filtered = filtered.filter((t) => t.priority === filterPriority);
    }

    return filtered;
  }, [tasks, showMyTasksOnly, currentUserId, searchQuery, filterClient, filterPriority]);

  const today = new Date().toISOString().split("T")[0];
  const activeFilterCount = (filterClient !== "all" ? 1 : 0) + (filterPriority !== "all" ? 1 : 0);

  // Sortable table data
  const { sortedData: sortedTasks, sortState, toggleSort } = useSortable<Task>({ data: visibleTasks });

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Board</h1>
          <p className="text-sm text-muted">Drag & drop untuk memindahkan tugas • Klik kartu untuk detail</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
                viewMode === "board" ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
              )}
            >
              <LayoutGrid size={14} /> Board
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-2 text-xs font-medium transition-colors",
                viewMode === "table" ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
              )}
            >
              <List size={14} /> Table
            </button>
          </div>
          <button
            onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium transition-colors",
              showMyTasksOnly ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
            )}
          >
            My Tasks Only
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari task, client, atau deskripsi..."
            className="input py-1.5 pl-8 text-xs"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-gray-900">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            showFilters || activeFilterCount > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-gray-900"
          )}
        >
          <Filter size={12} />
          Filter
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Client:</label>
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              {clients.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted">Prioritas:</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="input py-1.5 text-xs"
            >
              <option value="all">Semua</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterClient("all"); setFilterPriority("all"); }}
              className="text-xs text-danger hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>
      )}

      {/* ==================== BOARD VIEW ==================== */}
      {viewMode === "board" && (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.id);
            return (
              <Droppable key={col.id} droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex min-h-0 flex-col rounded-lg border border-border border-t-4 bg-surface/50 transition-colors",
                      col.color,
                      snapshot.isDraggingOver && "bg-primary/5"
                    )}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
                      <span className="text-sm font-semibold text-gray-900">{col.label}</span>
                      <span className="badge bg-background text-muted">{colTasks.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-2">
                      {colTasks.map((task, index) => {
                        const isOverdue = task.due_date && task.due_date < today && task.status !== "done" && task.status !== "blocked";
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                onClick={() => setDetailTaskId(task.id)}
                                className={cn(
                                  "cursor-pointer rounded-md border border-border bg-background p-3 transition-all hover:border-primary hover:shadow-md active:cursor-grabbing",
                                  dragSnapshot.isDragging && "shadow-lg ring-2 ring-primary/50"
                                )}
                              >
                                <div className="mb-1.5 flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                                  <div className="flex items-center gap-1">
                                    {isOverdue && <AlertTriangle size={12} className="text-danger" />}
                                    <Flag size={12} className={priorityColors[task.priority] || "text-muted"} />
                                  </div>
                                </div>

                                {/* Description preview */}
                                {task.description && (
                                  <p className="mb-1.5 line-clamp-2 text-xs text-muted">
                                    {task.description}
                                  </p>
                                )}

                                {task.client && <p className="mb-1 text-xs text-muted">{task.client.name}</p>}
                                {task.division && (
                                  <span className="mb-2 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    {task.division}
                                  </span>
                                )}
                                <div className="flex items-center justify-between">
                                  <div className="flex -space-x-1.5">
                                    {task.task_assignees?.map((a) => (
                                      <div
                                        key={a.user_id}
                                        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface text-[10px] font-semibold text-gray-900"
                                        title={a.user?.full_name}
                                      >
                                        {getInitials(a.user?.full_name)}
                                      </div>
                                    ))}
                                  </div>
                                  {task.due_date && (
                                    <span className={cn("flex items-center gap-1 text-xs", isOverdue ? "font-medium text-danger" : "text-muted")}>
                                      <Calendar size={11} />
                                      {formatDate(task.due_date, { day: "numeric", month: "short" })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {colTasks.length === 0 && (
                        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border">
                          <p className="text-xs text-muted">Drop tugas di sini</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
      )}

      {/* ==================== TABLE VIEW ==================== */}
      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <SortableTh label="Title" sortKey="title" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[300px]" />
                <SortableTh label="Client" sortKey="client.name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[150px]" />
                <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                <SortableTh label="Priority" sortKey="priority" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[90px]" />
                <th className="w-[110px] px-4 py-3 text-left text-xs font-medium">Assignees</th>
                <SortableTh label="Deadline" sortKey="due_date" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[120px]" />
                <SortableTh label="Division" sortKey="division" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[130px]" />
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted">Tidak ada task yang cocok dengan filter</td>
                </tr>
              ) : (
                sortedTasks.map((task) => {
                  const isOverdue = task.due_date && task.due_date < today && task.status !== "done" && task.status !== "blocked";
                  const statusLabel = COLUMNS.find((c) => c.id === task.status)?.label || task.status;
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setDetailTaskId(task.id)}
                      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-primary/5"
                    >
                      <td className="px-4 py-3" title={task.title}>
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {isOverdue && <AlertTriangle size={12} className="shrink-0 text-danger" />}
                          <span className="truncate font-medium text-gray-900">{task.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        <span className="block truncate" title={task.client?.name}>
                          {task.client?.name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("flex items-center gap-1 text-xs font-medium capitalize", priorityColors[task.priority] || "text-muted")}>
                          <Flag size={10} className="shrink-0" /> {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex -space-x-1.5">
                          {task.task_assignees?.map((a) => (
                            <div
                              key={a.user_id}
                              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-background text-[10px] font-semibold text-gray-900"
                              title={a.user?.full_name}
                            >
                              {getInitials(a.user?.full_name)}
                            </div>
                          ))}
                          {(!task.task_assignees || task.task_assignees.length === 0) && <span className="text-xs text-muted">—</span>}
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-xs", isOverdue ? "font-medium text-danger" : "text-muted")}>
                        {task.due_date ? formatDate(task.due_date, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        <span className="block truncate" title={task.division || undefined}>
                          {task.division || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Detail Modal */}
      {detailTaskId && (
        <TaskDetailModal
          taskId={detailTaskId}
          onClose={() => setDetailTaskId(null)}
          onUpdated={loadTasks}
          onDeleted={loadTasks}
        />
      )}

      {/* Create Task Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Buat Task Baru</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Judul Task *</label>
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
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Deskripsi</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Client</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Prioritas</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Status Awal</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="input"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Divisi</label>
                  <select
                    value={form.division}
                    onChange={(e) => setForm({ ...form, division: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih Divisi —</option>
                    <option value="Creative Director">Creative Director</option>
                    <option value="Content Creator">Content Creator</option>
                    <option value="Production">Production</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Advertiser">Advertiser</option>
                    <option value="Account Executive">Account Executive</option>
                    <option value="Copywriter">Copywriter</option>
                    <option value="Developer">Developer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Deadline</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {/* Assignees - scoped by division if selected */}
              <AssigneePicker
                selectedIds={formAssignees}
                onChange={setFormAssignees}
                label="Assignee"
                divisionFilter={form.division || null}
              />
              {form.division && (
                <p className="-mt-2 text-xs text-muted">
                  💡 Assignee difilter otomatis berdasarkan divisi <strong>{form.division}</strong>
                </p>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Result / Output</label>
                <input
                  type="text"
                  value={form.result}
                  onChange={(e) => setForm({ ...form, result: e.target.value })}
                  placeholder="Contoh: Monthly report selesai, 10 creative approved"
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
                  Blocker / Kendala
                </label>
                <textarea
                  rows={2}
                  value={form.blocker}
                  onChange={(e) => setForm({ ...form, blocker: e.target.value })}
                  placeholder="Isi jika ada kendala/hambatan..."
                  className="input resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
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