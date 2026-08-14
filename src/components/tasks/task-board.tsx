"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import type { DropResult } from "@hello-pangea/dnd";

// Code-split @hello-pangea/dnd (~120KB) — only loads in board view
const DragDropContext = dynamic(() => import("@hello-pangea/dnd").then((m) => m.DragDropContext), { ssr: false });
const Droppable = dynamic(() => import("@hello-pangea/dnd").then((m) => m.Droppable), { ssr: false });
const Draggable = dynamic(() => import("@hello-pangea/dnd").then((m) => m.Draggable), { ssr: false });
import { Plus, Calendar, Flag, X, AlertCircle, AlertTriangle, Search, Filter, LayoutGrid, List, Lightbulb, User, CheckSquare, Trash2, Layers, BarChart3, TrendingUp, CheckCircle2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { useSortable } from "@/hooks/use-sortable-table";
import { SortableTh } from "@/components/ui/sortable-th";
import { Avatar } from "@/components/ui/avatar";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  division: string | null;
  due_date: string | null;
  client?: { name: string };
  task_assignees?: { user_id: string; user: { full_name: string; avatar_url: string | null } }[];
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

export interface TaskBoardProps {
  /** Filter tasks to specific division. null = show all */
  division?: string | null;
  /** Page title shown in header */
  pageTitle?: string;
  /** Page subtitle */
  pageSubtitle?: string;
  /** Default division value for new tasks created from this board */
  defaultDivision?: string;
}

// Division tab options for filter
const DIVISION_TABS = [
  { label: "All Tasks", value: null },
  { label: "Creative", value: "Creative Director" },
  { label: "Editor", value: "Editor" },
  { label: "Production", value: "Production" },
  { label: "Social Media", value: "Social Media Manager" },
];

export function TaskBoard({
  division = null,
  pageTitle = "Task Board",
  pageSubtitle = "Drag & drop untuk memindahkan tugas • Klik kartu untuk detail",
  defaultDivision = "",
}: TaskBoardProps) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);

  // Active division filter (internal state, initialized from prop)
  const [activeDivision, setActiveDivision] = useState<string | null>(division);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);

  // View mode: board, table, or analytics
  const [viewMode, setViewMode] = useState<"board" | "table" | "analytics">("board");

  // Analytics month picker state ([year, month 0-11])
  const now = new Date();
  const [analyticsMonth, setAnalyticsMonth] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [showBulkBar, setShowBulkBar] = useState(false);

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
    division: defaultDivision,
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
  }, [supabase, activeDivision]);

  // Reset form division when activeDivision changes
  useEffect(() => {
    setForm((f) => ({ ...f, division: activeDivision || defaultDivision }));
  }, [activeDivision, defaultDivision]);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  }

  async function loadTasks() {
    try {
      let query = supabase
        .from("tasks")
        .select(
          `
          id, title, description, status, priority, division, due_date,
          client:clients(name),
          task_assignees(user_id, user:profiles(full_name, avatar_url))
          `
        )
        .order("created_at", { ascending: false });

      // Filter by division if specified
      if (activeDivision) {
        query = query.eq("division", activeDivision);
      }

      const { data, error } = await query;
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

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      setShowBulkBar(next.size > 0);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sortedTasks.length) {
      setSelectedIds(new Set());
      setShowBulkBar(false);
    } else {
      setSelectedIds(new Set(sortedTasks.map((t) => t.id)));
      setShowBulkBar(true);
    }
  }

  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("tasks")
      .update({ status: bulkStatus } as never)
      .in("id", ids);
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      toast.success(`${ids.length} task diupdate ke ${bulkStatus.replace("_", " ")}`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkStatus("");
      loadTasks();
    }
  }

  async function handleBulkPriority() {
    if (!bulkPriority || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("tasks")
      .update({ priority: bulkPriority } as never)
      .in("id", ids);
    if (error) {
      toast.error("Bulk update gagal: " + error.message);
    } else {
      toast.success(`${ids.length} task priority diubah ke ${bulkPriority}`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkPriority("");
      loadTasks();
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} task yang dipilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("tasks").delete().in("id", ids);
    if (error) {
      toast.error("Bulk delete gagal: " + error.message);
    } else {
      toast.success(`${ids.length} task dihapus`);
      setSelectedIds(new Set());
      setShowBulkBar(false);
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
      setForm({ title: "", description: "", client_id: "", priority: "medium", due_date: "", status: "todo", division: defaultDivision, result: "", blocker: "", start_date: "" });
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

  // ==================== ANALYTICS CALCULATIONS ====================
  // Analytics: tasks for selected month
  const monthTasks = useMemo(() => {
    const [year, month] = analyticsMonth;
    return visibleTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [visibleTasks, analyticsMonth]);

  // Analytics: tasks from previous month (for carry-over)
  const prevMonthTasks = useMemo(() => {
    const [year, month] = analyticsMonth;
    const prevDate = new Date(year, month - 1, 1);
    return visibleTasks.filter((t) => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d.getFullYear() === prevDate.getFullYear() && d.getMonth() === prevDate.getMonth();
    });
  }, [visibleTasks, analyticsMonth]);

  // Analytics KPIs
  const totalTasks = monthTasks.length;
  const doneTasks = monthTasks.filter((t) => t.status === "done").length;
  const inProgressTasks = monthTasks.filter((t) => t.status === "in_progress" || t.status === "review").length;
  const overdueTasks = monthTasks.filter((t) => t.due_date && t.due_date < today && t.status !== "done" && t.status !== "blocked").length;
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const carryOver = prevMonthTasks.filter((t) => t.status !== "done");

  // Analytics: division breakdown
  const divisionBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTasks.forEach((t) => {
      const div = t.division || "Unassigned";
      map[div] = (map[div] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthTasks]);

  // Analytics: status distribution
  const statusDist = COLUMNS.map((col) => ({
    ...col,
    count: monthTasks.filter((t) => t.status === col.id).length,
  }));
  const maxStatusCount = Math.max(...statusDist.map((s) => s.count), 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{pageTitle}</h1>
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
    <div className="flex min-h-[calc(100vh-7rem)] flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{pageTitle}</h1>
          <p className="hidden text-sm text-muted sm:block">{pageSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "flex min-h-[44px] items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors",
                viewMode === "board" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
              )}
            >
              <LayoutGrid size={14} /> Board
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "flex min-h-[44px] items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors",
                viewMode === "table" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
              )}
            >
              <List size={14} /> Table
            </button>
            <button
              onClick={() => setViewMode("analytics")}
              className={cn(
                "flex min-h-[44px] items-center gap-1 px-3 py-2.5 text-xs font-medium transition-colors",
                viewMode === "analytics" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
              )}
            >
              <BarChart3 size={14} /> Analytics
            </button>
          </div>
          <button
            onClick={() => setShowMyTasksOnly(!showMyTasksOnly)}
            className={cn(
              "flex min-h-[44px] items-center gap-1 rounded-md px-3 py-2.5 text-xs font-medium transition-colors",
              showMyTasksOnly ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground"
            )}
          >
            <User size={14} /> My Tasks
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary min-h-[44px]">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {/* Division Filter Tabs */}
      {!division && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
          {DIVISION_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveDivision(tab.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeDivision === tab.value
                  ? "bg-primary text-white"
                  : "bg-surface text-muted hover:bg-background hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari task..."
            className="input min-h-[44px] py-2 pl-9 text-xs"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 text-muted hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
            showFilters || activeFilterCount > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-foreground"
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

      {/* ==================== ANALYTICS VIEW ==================== */}
      {viewMode === "analytics" && (
        <div className="space-y-6">
          {/* Month Picker */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                const [y, m] = analyticsMonth;
                const d = new Date(y, m - 1, 1);
                setAnalyticsMonth([d.getFullYear(), d.getMonth()]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface hover:bg-background"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-[200px] text-center text-lg font-bold text-foreground">
              {monthNames[analyticsMonth[1]]} {analyticsMonth[0]}
            </h2>
            <button
              onClick={() => {
                const [y, m] = analyticsMonth;
                const d = new Date(y, m + 1, 1);
                setAnalyticsMonth([d.getFullYear(), d.getMonth()]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface hover:bg-background"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {/* Total */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1 flex items-center gap-2 text-muted">
                <Layers size={16} />
                <span className="text-xs font-medium">Total Tasks</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalTasks}</p>
            </div>
            {/* Done */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1 flex items-center gap-2 text-success">
                <CheckCircle2 size={16} />
                <span className="text-xs font-medium">Completed</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{doneTasks}</p>
            </div>
            {/* In Progress */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1 flex items-center gap-2 text-warning">
                <Clock size={16} />
                <span className="text-xs font-medium">In Progress</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{inProgressTasks}</p>
            </div>
            {/* Overdue */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1 flex items-center gap-2 text-danger">
                <AlertTriangle size={16} />
                <span className="text-xs font-medium">Overdue</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{overdueTasks}</p>
            </div>
            {/* Completion Rate */}
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-1 flex items-center gap-2 text-primary">
                <TrendingUp size={16} />
                <span className="text-xs font-medium">Completion Rate</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
            </div>
          </div>

          {/* Status Bar Chart */}
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Distribusi Status</h3>
            <div className="space-y-3">
              {statusDist.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted">{s.label}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-background">
                    <div
                      className="flex h-full items-center justify-end rounded-md bg-primary px-2 text-[10px] font-medium text-white transition-all"
                      style={{ width: `${(s.count / maxStatusCount) * 100}%`, minWidth: s.count > 0 ? "2rem" : "0" }}
                    >
                      {s.count > 0 && s.count}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carry-Over Alert */}
          {carryOver.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertCircle size={16} /> Carry-Over dari {monthNames[(analyticsMonth[1] + 11) % 12]} ({carryOver.length} task)
              </h3>
              <div className="space-y-2">
                {carryOver.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                    <span className="truncate text-sm text-foreground">{t.title}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
                      {COLUMNS.find((c) => c.id === t.status)?.label || t.status}
                    </span>
                  </div>
                ))}
                {carryOver.length > 5 && (
                  <p className="pt-1 text-center text-xs text-muted">+ {carryOver.length - 5} task lainnya...</p>
                )}
              </div>
            </div>
          )}

          {/* Division Breakdown Table */}
          {divisionBreakdown.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Breakdown per Divisi</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="pb-2">Divisi</th>
                    <th className="pb-2 text-right">Jumlah Task</th>
                    <th className="pb-2 text-right">Persentase</th>
                  </tr>
                </thead>
                <tbody>
                  {divisionBreakdown.map(([div, count]) => (
                    <tr key={div} className="border-b border-border/50 last:border-0">
                      <td className="py-2 text-foreground">{div}</td>
                      <td className="py-2 text-right font-medium text-foreground">{count}</td>
                      <td className="py-2 text-right text-muted">{Math.round((count / totalTasks) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalTasks === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 size={40} className="mb-3 text-muted/40" />
              <p className="text-sm text-muted">Tidak ada task untuk bulan {monthNames[analyticsMonth[1]]} {analyticsMonth[0]}</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== BOARD VIEW ==================== */}
      {viewMode === "board" && (
      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Mobile: horizontal scroll Kanban; Desktop: CSS grid with constrained height */}
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.status === col.id);
            return (
              <Droppable key={col.id} droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      // Mobile: fixed width for horizontal scroll; Desktop: full width with constrained height + inner scroll
                      "flex max-h-[60vh] min-h-[200px] w-[280px] shrink-0 flex-col rounded-lg border border-border border-t-4 bg-surface/50 transition-colors lg:max-h-[calc(100vh-20rem)] lg:w-auto lg:shrink",
                      col.color,
                      snapshot.isDraggingOver && "bg-primary/5"
                    )}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-border p-3">
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <span className="badge bg-background text-muted">{colTasks.length}</span>
                    </div>
                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
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
                                  <p className="text-sm font-medium text-foreground">{task.title}</p>
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
                                      <div key={a.user_id} title={a.user?.full_name}>
                                        {a.user?.avatar_url ? (
                                          <Avatar src={a.user.avatar_url} name={a.user?.full_name} size={24} className="border-2 border-background" referrerPolicy="no-referrer" />
                                        ) : (
                                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface text-[10px] font-semibold text-foreground">
                                            {getInitials(a.user?.full_name)}
                                          </div>
                                        )}
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

      {/* ==================== BULK ACTION BAR ==================== */}
      {showBulkBar && viewMode === "table" && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckSquare size={16} className="text-primary" />
            <span className="text-sm font-semibold text-primary">{selectedIds.size} task dipilih</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="input w-auto py-1.5 text-xs"
            >
              <option value="">Ubah Status...</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
            {bulkStatus && (
              <button onClick={handleBulkStatus} className="btn-primary px-3 py-1.5 text-xs">
                <Layers size={12} /> Apply Status
              </button>
            )}
            <select
              value={bulkPriority}
              onChange={(e) => setBulkPriority(e.target.value)}
              className="input w-auto py-1.5 text-xs"
            >
              <option value="">Ubah Prioritas...</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            {bulkPriority && (
              <button onClick={handleBulkPriority} className="btn-primary px-3 py-1.5 text-xs">
                <Layers size={12} /> Apply Priority
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 rounded-md bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
            >
              <Trash2 size={12} /> Delete
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setShowBulkBar(false); }}
              className="px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* ==================== TABLE VIEW ==================== */}
      {viewMode === "table" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="w-[40px] px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sortedTasks.length && sortedTasks.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-border"
                  />
                </th>
                <SortableTh label="Title" sortKey="title" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[300px]" />
                <SortableTh label="Client" sortKey="client.name" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[150px]" />
                <SortableTh label="Status" sortKey="status" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[100px]" />
                <SortableTh label="Priority" sortKey="priority" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[90px]" />
                <th className="w-[110px] px-4 py-3 text-left text-xs font-medium">Assignees</th>
                <SortableTh label="Deadline" sortKey="due_date" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[120px]" />
                {!activeDivision && (
                  <SortableTh label="Division" sortKey="division" activeKey={sortState.key} direction={sortState.direction} onSort={toggleSort} className="w-[130px]" />
                )}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={activeDivision ? 7 : 8} className="py-8 text-center text-sm text-muted">Tidak ada task yang cocok dengan filter</td>
                </tr>
              ) : (
                sortedTasks.map((task) => {
                  const isOverdue = task.due_date && task.due_date < today && task.status !== "done" && task.status !== "blocked";
                  const statusLabel = COLUMNS.find((c) => c.id === task.status)?.label || task.status;
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setDetailTaskId(task.id)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-primary/5",
                        selectedIds.has(task.id) && "bg-primary/5"
                      )}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(task.id)}
                          onChange={() => toggleSelect(task.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3" title={task.title}>
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          {isOverdue && <AlertTriangle size={12} className="shrink-0 text-danger" />}
                          <span className="truncate font-medium text-foreground">{task.title}</span>
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
                            <div key={a.user_id} title={a.user?.full_name}>
                              {a.user?.avatar_url ? (
                                <Avatar src={a.user.avatar_url} name={a.user?.full_name} size={24} className="border-2 border-surface" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-background text-[10px] font-semibold text-foreground">
                                  {getInitials(a.user?.full_name)}
                                </div>
                              )}
                            </div>
                          ))}
                          {(!task.task_assignees || task.task_assignees.length === 0) && <span className="text-xs text-muted">—</span>}
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-xs", isOverdue ? "font-medium text-danger" : "text-muted")}>
                        {task.due_date ? formatDate(task.due_date, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      {!activeDivision && (
                        <td className="px-4 py-3 text-xs text-muted">
                          <span className="block truncate" title={task.division || undefined}>
                            {task.division || "—"}
                          </span>
                        </td>
                      )}
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

      {/* Create Task Modal — 2-Column + Sticky */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">Buat Task Baru</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleCreateTask} className="flex flex-1 flex-col overflow-hidden">
              <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-4 lg:grid-cols-2">
                {/* Full-width: Title */}
                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Judul Task *</label>
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

                {/* Full-width: Description */}
                <div className="lg:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Deskripsi</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Detail tugas (opsional)"
                    className="input resize-none"
                  />
                </div>

                {/* LEFT column fields */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client</label>
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Status Awal</label>
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Start Date</label>
                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Result / Output</label>
                    <input
                      type="text"
                      value={form.result}
                      onChange={(e) => setForm({ ...form, result: e.target.value })}
                      placeholder="Contoh: Monthly report selesai"
                      className="input"
                    />
                  </div>
                </div>

                {/* RIGHT column fields */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Prioritas</label>
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

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Divisi</label>
                    <select
                      value={form.division}
                      onChange={(e) => setForm({ ...form, division: e.target.value })}
                      className="input"
                      // Lock division when on a sub-page (division prop is set)
                      disabled={!!activeDivision}
                    >
                      <option value="">— Pilih Divisi —</option>
                      <option value="Creative Director">Creative Director</option>
                      <option value="Content Creator">Content Creator</option>
                      <option value="Editor">Editor</option>
                      <option value="Content Production">Content Production</option>
                      <option value="Production">Production</option>
                      <option value="Social Media Manager">Social Media Manager</option>
                      <option value="Project Manager">Project Manager</option>
                      <option value="Advertiser">Advertiser</option>
                      <option value="Account Executive">Account Executive</option>
                      <option value="Copywriter">Copywriter</option>
                      <option value="Developer">Developer</option>
                    </select>
                    {activeDivision && (
                      <p className="mt-1 text-xs text-muted">🔒 Division terkunci: <strong>{activeDivision}</strong></p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Deadline</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Blocker / Kendala
                    </label>
                    <textarea
                      rows={2}
                      value={form.blocker}
                      onChange={(e) => setForm({ ...form, blocker: e.target.value })}
                      placeholder="Isi jika ada kendala..."
                      className="input resize-none"
                    />
                  </div>
                </div>

                {/* Full-width: Assignees */}
                <div className="lg:col-span-2">
                  <AssigneePicker
                    selectedIds={formAssignees}
                    onChange={setFormAssignees}
                    label="Assignee"
                    divisionFilter={form.division || null}
                  />
                  {form.division && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs text-muted">
                      <Lightbulb size={12} className="mt-0.5 shrink-0 text-warning" />
                      <span>Assignee difilter otomatis berdasarkan divisi <strong>{form.division}</strong></span>
                    </p>
                  )}
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