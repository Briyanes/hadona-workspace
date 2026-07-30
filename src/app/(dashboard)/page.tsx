"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  Megaphone,
  DollarSign,
  Plus,
  FileText,
  Building2,
  CheckCircle,
  Activity,
  ArrowRight,
} from "lucide-react";
import { formatIDR, timeUntil, cn } from "@/lib/utils";

interface Stats {
  totalTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  doneTasks: number;
  overdueTasks: number;
  activeClients: number;
  activeAdAccounts: number;
  totalBudget: number;
  totalMrr: number;
  teamMembers: number;
}

interface MyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  client?: { name: string };
}

interface ActivityLog {
  id: string;
  description: string;
  entity_type: string;
  action: string;
  created_at: string;
  client?: { name: string };
}

const entityIcons: Record<string, { icon: typeof Activity; color: string }> = {
  task: { icon: CheckCircle, color: "text-primary bg-primary/10" },
  report: { icon: FileText, color: "text-accent bg-accent/10" },
  strategy: { icon: TrendingUp, color: "text-success bg-success/10" },
  ad_account: { icon: Megaphone, color: "text-warning bg-warning/10" },
  client: { icon: Building2, color: "text-primary bg-primary/10" },
};

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function load() {
      try {
        timeout = setTimeout(() => {
          if (!cancelled) {
            setError("Timeout: Server tidak merespons. Cek koneksi internet.");
            setLoading(false);
          }
        }, 10000);

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
          if (profile) setCurrentUserName((profile as { full_name: string }).full_name);
        }

        const [tasks, clients, adAccounts, profiles] = await Promise.all([
          supabase.from("tasks").select("status, due_date, priority"),
          supabase.from("clients").select("status, contract_value"),
          supabase.from("ad_accounts").select("daily_budget, status").eq("status", "active"),
          supabase.from("profiles").select("id").eq("is_active", true),
        ]);

        if (cancelled) return;

        const allTasks = (tasks.data as { status: string; due_date: string | null; priority: string }[]) || [];
        const clientList = (clients.data as { status: string; contract_value: number | null }[]) || [];
        const accountList = (adAccounts.data as { daily_budget: number | null; status: string }[]) || [];
        const profileList = (profiles.data as { id: string }[]) || [];
        const today = new Date().toISOString().split("T")[0];

        setStats({
          totalTasks: allTasks.length,
          todoTasks: allTasks.filter((t) => t.status === "todo").length,
          inProgressTasks: allTasks.filter((t) => t.status === "in_progress").length,
          doneTasks: allTasks.filter((t) => t.status === "done").length,
          overdueTasks: allTasks.filter(
            (t) => t.due_date && t.due_date < today && t.status !== "done" && t.status !== "blocked"
          ).length,
          activeClients: clientList.filter((c) => c.status === "active").length,
          activeAdAccounts: accountList.length,
          totalBudget: accountList.reduce((sum, a) => sum + (a.daily_budget || 0), 0),
          totalMrr: clientList
            .filter((c) => c.status === "active" || c.status === "onboarding")
            .reduce((sum, c) => sum + (c.contract_value || 0), 0),
          teamMembers: profileList.length,
        });

        // Fetch my tasks (overdue or due today, assigned to current user)
        if (user) {
          const { data: myTasksData } = await supabase
            .from("tasks")
            .select(
              `
              id, title, status, priority, due_date,
              client:clients(name),
              task_assignees!inner(user_id)
            `
            )
            .eq("task_assignees.user_id", user.id)
            .in("status", ["todo", "in_progress", "review"])
            .or(`due_date.lte.${today},due_date.is.null`)
            .order("due_date", { ascending: true, nullsFirst: false })
            .limit(8);

          if (cancelled) return;
          setMyTasks((myTasksData as unknown as MyTask[]) || []);
        }

        // Fetch recent activity logs
        const { data: activityData } = await supabase
          .from("activity_logs")
          .select(
            `
            id, description, entity_type, action, created_at,
            client:clients(name)
          `
          )
          .order("created_at", { ascending: false })
          .limit(8);

        if (cancelled) return;
        setActivities((activityData as unknown as ActivityLog[]) || []);

        setLoading(false);
        clearTimeout(timeout);
      } catch {
        if (!cancelled) {
          setError("Gagal memuat data. Cek koneksi atau login ulang.");
          setLoading(false);
        }
      }
    }
    load();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card skeleton h-32" />
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

  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 19 ? "Selamat Sore" : "Selamat Malam";

  const statCards = [
    { label: "Active Clients", value: stats?.activeClients ?? 0, icon: Users, color: "text-primary", bg: "bg-primary/10", href: "/clients" },
    { label: "Total MRR", value: formatIDR(stats?.totalMrr ?? 0), icon: DollarSign, color: "text-success", bg: "bg-success/10", href: "/clients" },
    { label: "Tasks In Progress", value: stats?.inProgressTasks ?? 0, icon: Clock, color: "text-warning", bg: "bg-warning/10", href: "/tasks" },
    { label: "Overdue Tasks", value: stats?.overdueTasks ?? 0, icon: AlertCircle, color: "text-danger", bg: "bg-danger/10", href: "/tasks" },
    { label: "Daily Ad Spend", value: formatIDR(stats?.totalBudget ?? 0), icon: Megaphone, color: "text-accent", bg: "bg-accent/10", href: "/ads-spend" },
    { label: "Team Members", value: stats?.teamMembers ?? 0, icon: Users, color: "text-primary", bg: "bg-primary/10", href: "/users" },
  ];

  const statusColors: Record<string, string> = {
    todo: "bg-surface text-muted",
    in_progress: "bg-warning/20 text-warning",
    review: "bg-accent/20 text-accent",
    done: "bg-success/20 text-success",
    blocked: "bg-danger/20 text-danger",
  };

  const priorityColors: Record<string, string> = {
    low: "text-muted",
    medium: "text-primary",
    high: "text-warning",
    urgent: "text-danger",
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Header with greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}{currentUserName ? `, ${currentUserName.split(" ")[0]}` : ""}! 👋
          </h1>
          <p className="text-sm text-muted">
            {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Link href="/tasks" className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={14} /> Task
          </Link>
          <Link href="/clients" className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background">
            <Plus size={14} /> Client
          </Link>
          <Link href="/reports" className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-background">
            <Plus size={14} /> Report
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="card card-hover group p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900 group-hover:text-primary">{card.value}</p>
            </Link>
          );
        })}
      </div>

      {/* 2-Column Layout: My Tasks + Recent Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ════ My Tasks Today ════ */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Clock className="text-primary" size={18} />
              <h2 className="font-semibold text-gray-900">Tugas Saya</h2>
            </div>
            <Link href="/tasks" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Lihat semua <ArrowRight size={10} />
            </Link>
          </div>
          <div className="space-y-2">
            {myTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="mb-2 text-success" size={28} />
                <p className="text-sm text-muted">Tidak ada tugas mendesak! 🎉</p>
              </div>
            ) : (
              myTasks.map((task) => {
                const isOverdue = task.due_date && task.due_date < today;
                const isToday = task.due_date === today;
                return (
                  <Link
                    key={task.id}
                    href="/tasks"
                    className="flex items-center gap-2 rounded-md border border-border bg-background p-2.5 transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    {/* Priority indicator */}
                    <div className={cn("h-8 w-1 shrink-0 rounded-full", 
                      task.priority === "urgent" ? "bg-danger" : 
                      task.priority === "high" ? "bg-warning" : 
                      task.priority === "medium" ? "bg-primary" : "bg-muted"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        {task.client && <span className="truncate">{task.client.name}</span>}
                        <span className={cn("badge px-1.5 py-0 text-[10px]", statusColors[task.status] || statusColors.todo)}>
                          {task.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                    {task.due_date && (
                      <div className={cn(
                        "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        isOverdue ? "bg-danger/10 text-danger" : isToday ? "bg-warning/10 text-warning" : "text-muted"
                      )}>
                        {isOverdue && <AlertTriangle size={10} />}
                        <Clock size={10} />
                        {timeUntil(task.due_date)}
                      </div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* ════ Recent Activity ════ */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Activity className="text-primary" size={18} />
              <h2 className="font-semibold text-gray-900">Aktivitas Terbaru</h2>
            </div>
          </div>
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="mb-2 text-muted" size={28} />
                <p className="text-sm text-muted">Belum ada aktivitas tercatat</p>
              </div>
            ) : (
              activities.map((log) => {
                const entityConfig = entityIcons[log.entity_type] || entityIcons.client;
                const Icon = entityConfig.icon;
                return (
                  <div key={log.id} className="flex items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-background">
                    <div className={cn("mt-0.5 inline-flex shrink-0 rounded-lg p-1.5", entityConfig.color)}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-900">{log.description}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        {log.client?.name && <span className="truncate">{log.client.name}</span>}
                        <span>•</span>
                        <span>{new Date(log.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}