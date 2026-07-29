"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Calendar, Flag, MessageCircle } from "lucide-react";
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
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();

    // Realtime subscription
    const channel = supabase
      .channel("tasks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => loadTasks())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select(`
        id, title, description, status, priority, division, due_date,
        client:clients(name),
        task_assignees(user_id, user:profiles(full_name))
      `)
      .order("created_at", { ascending: false });
    setTasks((data as unknown as Task[]) || []);
    setLoading(false);
  }

  async function updateStatus(taskId: string, newStatus: string) {
    const { error } = await supabase.from("tasks").update({ status: newStatus } as never).eq("id", taskId);
    if (error) {
      toast.error("Gagal update status: " + error.message);
    } else {
      toast.success("Task dipindahkan ke " + newStatus.replace("_", " "));
      loadTasks();
    }
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

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Board</h1>
          <p className="text-sm text-muted">Drag & drop untuk memindahkan tugas</p>
        </div>
        <button className="btn-primary">
          <Plus size={16} /> New Task
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={cn("flex flex-col rounded-lg border border-border border-t-4 bg-surface/50", col.color)}
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
                    {task.client && (
                      <p className="mb-2 text-xs text-muted">{task.client.name}</p>
                    )}
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
    </div>
  );
}