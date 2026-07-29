"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Megaphone,
} from "lucide-react";
import { formatIDR, timeUntil } from "@/lib/utils";

interface Stats {
  totalTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  doneTasks: number;
  overdueTasks: number;
  activeClients: number;
  activeAdAccounts: number;
  totalBudget: number;
}

interface RecentTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  client?: { name: string };
}

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const [tasks, clients, adAccounts] = await Promise.all([
          supabase.from("tasks").select("status, due_date, priority"),
          supabase.from("clients").select("status").eq("status", "active"),
          supabase.from("ad_accounts").select("daily_budget, status").eq("status", "active"),
        ]);

        if (cancelled) return;

        const allTasks = (tasks.data as { status: string; due_date: string | null; priority: string }[]) || [];
        const clientList = (clients.data as { status: string }[]) || [];
        const accountList = (adAccounts.data as { daily_budget: number | null; status: string }[]) || [];
        const today = new Date().toISOString().split("T")[0];

        setStats({
          totalTasks: allTasks.length,
          todoTasks: allTasks.filter((t) => t.status === "todo").length,
          inProgressTasks: allTasks.filter((t) => t.status === "in_progress").length,
          doneTasks: allTasks.filter((t) => t.status === "done").length,
          overdueTasks: allTasks.filter(
            (t) => t.due_date && t.due_date < today && t.status !== "done"
          ).length,
          activeClients: clientList.length,
          activeAdAccounts: accountList.length,
          totalBudget: accountList.reduce(
            (sum, a) => sum + (a.daily_budget || 0),
            0
          ),
        });

        const { data: recent } = await supabase
          .from("tasks")
          .select("id, title, status, priority, due_date, client:clients(name)")
          .order("created_at", { ascending: false })
          .limit(5);

        if (cancelled) return;

        setRecentTasks((recent as unknown as RecentTask[]) || []);
        setLoading(false);
        clearTimeout(timeout);
      } catch (err) {
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

  const statCards = [
    {
      label: "Active Clients",
      value: stats?.activeClients ?? 0,
      icon: Users,
      color: "text-primary",
      href: "/clients",
    },
    {
      label: "Tasks In Progress",
      value: stats?.inProgressTasks ?? 0,
      icon: Clock,
      color: "text-warning",
      href: "/tasks",
    },
    {
      label: "Overdue Tasks",
      value: stats?.overdueTasks ?? 0,
      icon: AlertCircle,
      color: "text-danger",
      href: "/tasks?filter=overdue",
    },
    {
      label: "Active Ad Accounts",
      value: stats?.activeAdAccounts ?? 0,
      icon: Megaphone,
      color: "text-success",
      href: "/ads-spend",
    },
  ];

  const statusColors: Record<string, string> = {
    todo: "bg-surface text-muted",
    in_progress: "bg-warning/20 text-warning",
    review: "bg-accent/20 text-accent",
    done: "bg-success/20 text-success",
    blocked: "bg-danger/20 text-danger",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-muted">Ringkasan aktivitas agency hari ini</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="card card-hover">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted">{card.label}</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <Icon className={card.color} size={20} />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Budget Overview */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">Total Daily Ad Spend Budget</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatIDR(stats?.totalBudget ?? 0)}
              <span className="ml-1 text-sm text-muted">/hari</span>
            </p>
          </div>
          <TrendingUp className="text-success" size={24} />
        </div>
      </div>

      {/* Recent Tasks */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Tasks</h2>
          <Link href="/tasks" className="text-xs text-primary hover:underline">
            Lihat semua →
          </Link>
        </div>
        <div className="space-y-2">
          {recentTasks.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Belum ada tugas</p>
          ) : (
            recentTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md border border-border bg-background p-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  {task.client && (
                    <p className="text-xs text-muted">{task.client.name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {task.due_date && (
                    <span className="text-xs text-muted">{timeUntil(task.due_date)}</span>
                  )}
                  <span className={`badge ${statusColors[task.status] || statusColors.todo}`}>
                    {task.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}