"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  User,
  CheckSquare,
  FileText,
  Target,
  Megaphone,
  AlertCircle,
  Plus,
  Calendar,
  DollarSign,
  AlertTriangle,
  Activity as ActivityIcon,
  CheckCircle,
  PencilLine,
  Trash,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatDate, formatIDR, cn, getInitials } from "@/lib/utils";
import { ContractManager } from "@/components/contracts/contract-manager";

interface ClientDetail {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  services: string[];
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  logo_url: string | null;
  contract_value: number | null;
  contract_start: string | null;
  contract_end: string | null;
  account_manager_id: string | null;
  account_manager?: { full_name: string } | null;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
}

interface Report {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  summary: string | null;
}

interface Strategy {
  id: string;
  title: string;
  description: string | null;
  period: string | null;
}

interface AdAccount {
  id: string;
  platform: string;
  account_name: string | null;
  daily_budget: number | null;
  status: string;
}

interface ActivityLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user: { full_name: string } | null;
}

type Tab = "overview" | "tasks" | "reports" | "strategy" | "ads" | "contract" | "activity";

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success",
  inactive: "bg-surface text-muted",
  hold: "bg-warning/20 text-warning",
  onboarding: "bg-primary/20 text-primary",
};

const taskStatusColors: Record<string, string> = {
  todo: "bg-surface text-muted",
  in_progress: "bg-warning/20 text-warning",
  review: "bg-accent/20 text-accent",
  done: "bg-success/20 text-success",
  blocked: "bg-danger/20 text-danger",
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const clientId = params.id as string;

  useEffect(() => {
    if (!clientId) return;
    loadAll();
  }, [clientId]);

  async function loadAll() {
    try {
      const [
        { data: clientData, error: clientErr },
        { data: tasksData, error: tasksErr },
        { data: reportsData, error: reportsErr },
        { data: strategiesData, error: strategiesErr },
        { data: adsData, error: adsErr },
        { data: activityData, error: activityErr },
      ] = await Promise.all([
        supabase.from("clients").select("*, account_manager:profiles!account_manager_id(full_name)").eq("id", clientId).single(),
        supabase
          .from("tasks")
          .select("id, title, status, priority, due_date")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("weekly_reports")
          .select("id, period_start, period_end, status, summary")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("client_strategies")
          .select("id, title, description, period")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("ad_accounts")
          .select("id, platform, account_name, daily_budget, status")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_logs")
          .select("id, entity_type, entity_id, action, description, metadata, created_at, user:user_id(full_name)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (clientErr) throw clientErr;

      setClient(clientData as unknown as ClientDetail);
      setTasks((tasksData as unknown as Task[]) || []);
      setReports((reportsData as unknown as Report[]) || []);
      setStrategies((strategiesData as unknown as Strategy[]) || []);
      setAdAccounts((adsData as unknown as AdAccount[]) || []);
      setActivityLogs((activityData as unknown as ActivityLog[]) || []);

      if (tasksErr || reportsErr || strategiesErr || adsErr || activityErr) {
        console.warn("Some sub-queries failed", { tasksErr, reportsErr, strategiesErr, adsErr, activityErr });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat data client: " + msg);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-32 rounded-lg" />
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 text-danger" size={32} />
        <p className="text-sm text-muted">{error || "Client tidak ditemukan"}</p>
        <Link href="/clients" className="btn-primary mt-4">
          Kembali ke Clients
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof CheckSquare; count: number }[] = [
    { id: "overview", label: "Overview", icon: Building2, count: 0 },
    { id: "tasks", label: "Tasks", icon: CheckSquare, count: tasks.length },
    { id: "reports", label: "Reports", icon: FileText, count: reports.length },
    { id: "strategy", label: "Strategy", icon: Target, count: strategies.length },
    { id: "ads", label: "Ad Accounts", icon: Megaphone, count: adAccounts.length },
    { id: "contract", label: "Kontrak", icon: FileText, count: 0 },
    { id: "activity", label: "Activity", icon: ActivityIcon, count: activityLogs.length },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <button onClick={() => router.push("/clients")} className="flex items-center gap-1 hover:text-gray-900">
          <ArrowLeft size={14} /> Clients
        </button>
        <span>/</span>
        <span className="text-gray-900">{client.name}</span>
      </div>

      {/* Header */}
      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logo_url} alt={client.name} className="h-14 w-14 rounded-xl border border-border object-contain" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface text-lg font-bold text-primary">
                {getInitials(client.name)}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{client.name}</h1>
                <span className={cn("badge", statusColors[client.status] || statusColors.inactive)}>
                  {client.status}
                </span>
              </div>
              <p className="text-sm text-muted">{client.industry || "No industry specified"}</p>
            </div>
          </div>
        </div>

        {/* Services */}
        {client.services.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
            {client.services.map((s) => (
              <span key={s} className="badge bg-background text-muted">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Contact Info */}
        {(client.contact_person || client.contact_phone || client.contact_email || client.account_manager) && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {client.account_manager && (
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-muted" />
                <div>
                  <p className="text-xs text-muted">Account Manager</p>
                  <p className="text-gray-900">{client.account_manager.full_name}</p>
                </div>
              </div>
            )}
            {client.contact_person && (
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-muted" />
                <div>
                  <p className="text-xs text-muted">Contact Person</p>
                  <p className="text-gray-900">{client.contact_person}</p>
                </div>
              </div>
            )}
            {client.contact_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-muted" />
                <div>
                  <p className="text-xs text-muted">Telepon</p>
                  <p className="text-gray-900">{client.contact_phone}</p>
                </div>
              </div>
            )}
            {client.contact_email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-muted" />
                <div>
                  <p className="text-xs text-muted">Email</p>
                  <p className="text-gray-900">{client.contact_email}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contract Info */}
        {(client.contract_value || client.contract_start || client.contract_end) && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {client.contract_value != null && client.contract_value > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <DollarSign size={14} className="text-success" />
                <div>
                  <p className="text-xs text-muted">Nilai Kontrak</p>
                  <p className="font-semibold text-gray-900">{formatIDR(client.contract_value)}/bulan</p>
                </div>
              </div>
            )}
            {client.contract_start && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-muted" />
                <div>
                  <p className="text-xs text-muted">Mulai Kontrak</p>
                  <p className="text-gray-900">{formatDate(client.contract_start, { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
              </div>
            )}
            {client.contract_end && (
              <div className="flex items-center gap-2 text-sm">
                {new Date(client.contract_end) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && new Date(client.contract_end) > new Date() ? (
                  <AlertTriangle size={14} className="text-warning" />
                ) : (
                  <Calendar size={14} className="text-muted" />
                )}
                <div>
                  <p className="text-xs text-muted">Akhir Kontrak</p>
                  <p className={cn(
                    "text-gray-900",
                    new Date(client.contract_end) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && new Date(client.contract_end) > new Date() && "font-medium text-warning"
                  )}>
                    {formatDate(client.contract_end, { day: "numeric", month: "long", year: "numeric" })}
                    {new Date(client.contract_end) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && new Date(client.contract_end) > new Date() && " (Akan habis!)"}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {client.notes && (
          <div className="mt-4 rounded-md border border-border bg-background p-3">
            <p className="text-xs text-muted">Catatan</p>
            <p className="text-sm text-gray-900">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs - Scrollable Carousel */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "border-primary text-gray-900"
                  : "border-transparent text-muted hover:text-gray-900"
              )}
            >
              <Icon size={14} />
              {t.label}
              {t.count > 0 && (
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <CheckSquare className="mb-2 text-primary" size={18} />
            <p className="text-2xl font-bold text-gray-900">{tasks.length}</p>
            <p className="text-xs text-muted">Total Tasks</p>
          </div>
          <div className="card">
            <FileText className="mb-2 text-warning" size={18} />
            <p className="text-2xl font-bold text-gray-900">{reports.length}</p>
            <p className="text-xs text-muted">Weekly Reports</p>
          </div>
          <div className="card">
            <Target className="mb-2 text-accent" size={18} />
            <p className="text-2xl font-bold text-gray-900">{strategies.length}</p>
            <p className="text-xs text-muted">Strategies</p>
          </div>
          <div className="card">
            <Megaphone className="mb-2 text-success" size={18} />
            <p className="text-2xl font-bold text-gray-900">
              {formatIDR(adAccounts.reduce((s, a) => s + (a.daily_budget || 0), 0))}
            </p>
            <p className="text-xs text-muted">Daily Budget</p>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Link href={`/tasks?client=${client.id}`} className="btn-primary text-xs">
              <Plus size={14} /> New Task
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Belum ada tugas untuk client ini</p>
          ) : (
            tasks.map((task) => (
              <Link
                key={task.id}
                href="/tasks"
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  {task.due_date && (
                    <p className="text-xs text-muted">Deadline: {formatDate(task.due_date)}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "badge",
                    taskStatusColors[task.status] || taskStatusColors.todo
                  )}
                >
                  {task.status.replace("_", " ")}
                </span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Link href={`/reports?client=${client.id}`} className="btn-primary text-xs">
              <Plus size={14} /> New Report
            </Link>
          </div>
          {reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Belum ada laporan untuk client ini</p>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(report.period_start, { day: "numeric", month: "short" })} —{" "}
                    {formatDate(report.period_end, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <span className="badge bg-background text-muted">{report.status}</span>
                </div>
                {report.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{report.summary}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "strategy" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Link href={`/strategy?client=${client.id}`} className="btn-primary text-xs">
              <Plus size={14} /> New Strategy
            </Link>
          </div>
          {strategies.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Belum ada strategi untuk client ini</p>
          ) : (
            strategies.map((strat) => (
              <div key={strat.id} className="rounded-md border border-border bg-surface p-3">
                <p className="text-sm font-medium text-gray-900">{strat.title}</p>
                {strat.period && <p className="text-xs text-muted">{strat.period}</p>}
                {strat.description && (
                  <p className="mt-1 text-sm text-muted">{strat.description}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "ads" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Link href={`/ads-spend?client=${client.id}`} className="btn-primary text-xs">
              <Plus size={14} /> New Ad Account
            </Link>
          </div>
          {adAccounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Belum ada ad account untuk client ini</p>
          ) : (
            adAccounts.map((ad) => (
              <div
                key={ad.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ad.platform} - {ad.account_name || "Unnamed"}
                  </p>
                  <p className="text-xs text-muted">{formatIDR(ad.daily_budget)}/hari</p>
                </div>
                <span className="badge bg-background text-muted">{ad.status}</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "contract" && (
        <ContractManager clientId={client.id} />
      )}

      {tab === "activity" && (
        <div className="card">
          {activityLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ActivityIcon className="mb-3 text-muted" size={32} />
              <p className="text-sm text-muted">Belum ada aktivitas tercatat</p>
              <p className="mt-1 text-xs text-muted">Aktivitas akan otomatis tercatat saat ada perubahan pada tugas, laporan, strategi, atau ad account.</p>
            </div>
          ) : (
            <div className="relative space-y-1">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

              {activityLogs.map((log) => {
                const icon = getActivityIcon(log.entity_type, log.action);
                const Icon = icon.icon;
                return (
                  <div key={log.id} className="relative flex gap-3 py-2 pl-0">
                    {/* Icon circle */}
                    <div className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-surface", icon.bg)}>
                      <Icon size={14} className={icon.text} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-1">
                      <p className="text-sm text-gray-900">{log.description}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <Clock size={10} />
                        <span>{formatDate(log.created_at, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                        {log.user?.full_name && (
                          <>
                            <span>•</span>
                            <span>{log.user.full_name}</span>
                          </>
                        )}
                        <span className={cn("ml-auto rounded px-1.5 py-0.5 text-[9px] font-medium uppercase", getEntityBadgeColor(log.entity_type))}>
                          {log.entity_type.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helper: Activity icon based on entity + action
// ============================================
function getActivityIcon(entityType: string, action: string): { icon: typeof CheckCircle; bg: string; text: string } {
  if (action === "created") return { icon: Plus, bg: "bg-primary/10", text: "text-primary" };
  if (action === "completed") return { icon: CheckCircle, bg: "bg-success/10", text: "text-success" };
  if (action === "status_changed") return { icon: PencilLine, bg: "bg-warning/10", text: "text-warning" };
  if (action === "deleted") return { icon: Trash, bg: "bg-danger/10", text: "text-danger" };
  if (action === "contract_updated") return { icon: TrendingUp, bg: "bg-success/10", text: "text-success" };

  switch (entityType) {
    case "task":
      return { icon: CheckSquare, bg: "bg-primary/10", text: "text-primary" };
    case "report":
      return { icon: FileText, bg: "bg-warning/10", text: "text-warning" };
    case "strategy":
      return { icon: Target, bg: "bg-accent/10", text: "text-accent" };
    case "ad_account":
      return { icon: Megaphone, bg: "bg-success/10", text: "text-success" };
    default:
      return { icon: ActivityIcon, bg: "bg-surface", text: "text-muted" };
  }
}

function getEntityBadgeColor(entityType: string): string {
  const map: Record<string, string> = {
    task: "bg-primary/10 text-primary",
    report: "bg-warning/10 text-warning",
    strategy: "bg-accent/10 text-accent",
    ad_account: "bg-success/10 text-success",
    client: "bg-surface text-muted",
  };
  return map[entityType] || "bg-surface text-muted";
}
