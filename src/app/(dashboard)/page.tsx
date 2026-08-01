"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  AlertCircle,
  AlertTriangle,
  TrendingDown,
  Users,
  Megaphone,
  DollarSign,
  Plus,
  FileText,
  Building2,
  CheckCircle,
  Activity,
  ArrowRight,
  BarChart3,
  Trophy,
  Send,
  TrendingUp,
} from "lucide-react";
import { formatIDR, timeUntil, cn } from "@/lib/utils";
import { BudgetAlertsBar } from "@/components/dashboard/budget-alerts-bar";
import { TeamWorkloadWidget } from "@/components/dashboard/team-workload-widget";
import { ActivityLogWidget } from "@/components/dashboard/activity-log-widget";

// ── Types ──
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

interface AdsKPI {
  weeklySpend: number;
  weeklyConversions: number;
  weeklyRevenue: number;
  avgRoas: number;
  bestClient: { name: string; roas: number } | null;
  worstClient: { name: string; roas: number } | null;
  reportDrafts: number;
  reportSubmitted: number;
  pendingReports: { id: string; clientName: string; periodEnd: string; status: string }[];
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

interface DashboardData {
  stats: Stats;
  userName: string;
  adsKpi: AdsKPI | null;
  myTasks: MyTask[];
  activities: ActivityLog[];
}

const entityIcons: Record<string, { icon: typeof Activity; color: string }> = {
  task: { icon: CheckCircle, color: "text-primary bg-primary/10" },
  report: { icon: FileText, color: "text-accent bg-accent/10" },
  strategy: { icon: TrendingUp, color: "text-success bg-success/10" },
  ad_account: { icon: Megaphone, color: "text-warning bg-warning/10" },
  client: { icon: Building2, color: "text-primary bg-primary/10" },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch("/api/dashboard", { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) throw new Error("Failed to load dashboard");

        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
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
    };
  }, []);

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

  const stats = data?.stats;
  const adsKpi = data?.adsKpi;
  const myTasks = data?.myTasks || [];
  const activities = data?.activities || [];
  const currentUserName = data?.userName || "";

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

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Header with greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}{currentUserName ? `, ${currentUserName.split(" ")[0]}` : ""}!
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

      {/* ════ Budget Pacing Alerts ════ */}
      <BudgetAlertsBar />

      {/* ════ Ads Performance KPI Bar ════ */}
      {adsKpi && adsKpi.weeklySpend > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-accent/5 to-primary/5 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-accent" size={16} />
              <h2 className="text-sm font-semibold text-gray-900">Performa Iklan Minggu Ini</h2>
            </div>
            <Link href="/reports" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Detail <ArrowRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg bg-background p-3 text-center">
              <p className="text-[10px] uppercase text-muted">Weekly Spend</p>
              <p className="mt-1 text-base font-bold text-gray-900">{formatIDR(adsKpi.weeklySpend)}</p>
            </div>
            <div className="rounded-lg bg-background p-3 text-center">
              <p className="text-[10px] uppercase text-muted">Conversions</p>
              <p className="mt-1 text-base font-bold text-gray-900">{adsKpi.weeklyConversions}</p>
            </div>
            <div className="rounded-lg bg-background p-3 text-center">
              <p className="text-[10px] uppercase text-muted">Avg ROAS</p>
              <p className={cn(
                "mt-1 text-base font-bold",
                adsKpi.avgRoas >= 3 ? "text-success" : adsKpi.avgRoas >= 1 ? "text-warning" : "text-danger"
              )}>
                {adsKpi.avgRoas.toFixed(2)}x
              </p>
            </div>
            {adsKpi.bestClient && (
              <div className="rounded-lg bg-success/5 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted">
                  <Trophy size={10} className="text-success" /> Best ROAS
                </p>
                <p className="mt-1 truncate text-sm font-bold text-success">{adsKpi.bestClient.name}</p>
                <p className="text-[10px] text-muted">{adsKpi.bestClient.roas.toFixed(2)}x</p>
              </div>
            )}
            {adsKpi.worstClient && adsKpi.worstClient.name !== adsKpi.bestClient?.name && (
              <div className="rounded-lg bg-danger/5 p-3 text-center">
                <p className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted">
                  <TrendingDown size={10} className="text-danger" /> Perlu Atensi
                </p>
                <p className="mt-1 truncate text-sm font-bold text-danger">{adsKpi.worstClient.name}</p>
                <p className="text-[10px] text-muted">{adsKpi.worstClient.roas.toFixed(2)}x</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3-Column Layout: My Tasks + Pending Reports + Recent Activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
                <p className="flex items-center justify-center gap-1 text-sm text-muted">
                  <CheckCircle size={14} className="text-success" />
                  Tidak ada tugas mendesak!
                </p>
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

        {/* ════ Pending Reports ════ */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <FileText className="text-accent" size={18} />
              <h2 className="font-semibold text-gray-900">Laporan Pending</h2>
            </div>
            <Link href="/reports" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Semua <ArrowRight size={10} />
            </Link>
          </div>
          <div className="space-y-2">
            {adsKpi && adsKpi.pendingReports.length > 0 ? (
              <>
                <div className="flex gap-2">
                  <span className="badge bg-surface text-muted text-[10px]">
                    {adsKpi.reportDrafts} Draft
                  </span>
                  <span className="badge bg-warning/20 text-warning text-[10px]">
                    {adsKpi.reportSubmitted} Submitted
                  </span>
                </div>
                {adsKpi.pendingReports.map((r) => (
                  <Link
                    key={r.id}
                    href="/reports"
                    className="flex items-center gap-2 rounded-md border border-border bg-background p-2.5 transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <div className={cn(
                      "h-8 w-1 shrink-0 rounded-full",
                      r.status === "draft" ? "bg-muted" : "bg-warning"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{r.clientName}</p>
                      <p className="text-xs text-muted">
                        s/d {new Date(r.periodEnd).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <span className={cn(
                      "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                      r.status === "draft" ? "bg-surface text-muted" : "bg-warning/10 text-warning"
                    )}>
                      {r.status === "draft" ? <Clock size={9} /> : <Send size={9} />}
                      {r.status}
                    </span>
                  </Link>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="mb-2 text-success" size={28} />
                <p className="flex items-center justify-center gap-1 text-sm text-muted">
                  <CheckCircle size={14} className="text-success" />
                  Semua report up to date!
                </p>
              </div>
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

      {/* ════ Team Workload ════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <TeamWorkloadWidget />
        </div>
        <div>
          <ActivityLogWidget />
        </div>
      </div>
    </div>
  );
}
