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
  Briefcase,
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
  MessageSquare,
  CheckCircle,
  Upload,
  PencilLine,
  Trash,
  TrendingUp,
  Clock,
} from "lucide-react";
import { formatDate, formatIDR, cn, getInitials } from "@/lib/utils";
import { ContractManager } from "@/components/contracts/contract-manager";
import { TaskDetailModal } from "@/components/tasks/task-detail-modal";
import { ReportDetailModal } from "@/components/reports/report-detail-modal";
import { StrategyDetailModal } from "@/components/strategy/strategy-detail-modal";
import { CommunicationLog } from "@/components/clients/communication-log";
import { ClientContentTab } from "@/components/clients/client-content-tab";
import { toast } from "sonner";
import Image from "next/image";

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

type Tab = "overview" | "tasks" | "reports" | "strategy" | "ads" | "contract" | "communication" | "content" | "activity";

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
  const [financial, setFinancial] = useState<{ real_mrr: number; outstanding: number; paid_this_month: number; overdue_count: number }>({ real_mrr: 0, outstanding: 0, paid_this_month: 0, overdue_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);

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

      // Load financial summary from view
      try {
        const { data: finData } = await supabase
          .from("client_financial_summary")
          .select("real_mrr, outstanding, paid_this_month, overdue_count")
          .eq("client_id", clientId)
          .single();

        if (finData) {
          const fin = finData as unknown as { real_mrr: number; outstanding: number; paid_this_month: number; overdue_count: number };
          setFinancial({
            real_mrr: Number(fin.real_mrr) || 0,
            outstanding: Number(fin.outstanding) || 0,
            paid_this_month: Number(fin.paid_this_month) || 0,
            overdue_count: Number(fin.overdue_count) || 0,
          });
        }
      } catch {
        // View might not exist yet — fallback
        console.warn("client_financial_summary view not available");
      }

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

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
      toast.success("Client berhasil dihapus");
      router.push("/clients");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal menghapus: " + msg);
      setDeleting(false);
      setShowDeleteConfirm(false);
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
    { id: "communication", label: "Interaksi", icon: MessageSquare, count: 0 },
    { id: "content", label: "Content", icon: Upload, count: 0 },
    { id: "activity", label: "Activity", icon: ActivityIcon, count: activityLogs.length },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <button onClick={() => router.push("/clients")} className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft size={14} /> Clients
        </button>
        <span>/</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      {/* Header */}
      <div className="card overflow-hidden">
        {/* Top section: logo + name + actions */}
        <div className="flex items-start gap-3">
          {client.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <Image src={client.logo_url!} alt={client.name} width={56} height={56} className="h-12 w-12 shrink-0 rounded-xl border border-border object-contain sm:h-14 sm:w-14" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-base font-bold text-primary sm:h-14 sm:w-14 sm:text-lg">
              {getInitials(client.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">{client.name}</h1>
              <span className={cn("badge shrink-0 capitalize", statusColors[client.status] || statusColors.inactive)}>
                {client.status}
              </span>
            </div>
            {client.industry && (
              <p className="mt-0.5 text-sm text-muted">{client.industry}</p>
            )}
            {client.services.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {client.services.map((s) => (
                  <span key={s} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => router.push(`/clients?edit=${client.id}`)}
            className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-foreground sm:text-sm"
          >
            <PencilLine size={14} /> <span>Edit</span>
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/5 sm:text-sm"
          >
            <Trash size={14} /> <span>Hapus</span>
          </button>
        </div>

        {/* Section: KONTAK */}
        {(client.contact_person || client.contact_phone || client.contact_email || client.account_manager) && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">📋 Kontak</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {client.account_manager && (
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase size={14} className="shrink-0 text-muted" />
                  <span className="text-muted">AM:</span>
                  <span className="truncate font-medium text-foreground">{client.account_manager.full_name}</span>
                </div>
              )}
              {client.contact_person && (
                <div className="flex items-center gap-2 text-sm">
                  <User size={14} className="shrink-0 text-muted" />
                  <span className="truncate text-foreground">{client.contact_person}</span>
                </div>
              )}
              {client.contact_phone && (
                <a
                  href={`tel:${client.contact_phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-sm text-primary transition-colors hover:underline"
                >
                  <Phone size={14} className="shrink-0 text-primary" />
                  <span className="truncate">{client.contact_phone}</span>
                </a>
              )}
              {client.contact_email && (
                <a
                  href={`mailto:${client.contact_email}`}
                  className="flex items-center gap-2 text-sm text-primary transition-colors hover:underline"
                >
                  <Mail size={14} className="shrink-0 text-primary" />
                  <span className="truncate">{client.contact_email}</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Section: KONTRAK + MRR */}
        {(financial.real_mrr > 0 || client.contract_start || client.contract_end) && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">📅 Kontrak</p>
            {client.contract_start && client.contract_end && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted" />
                  <span className="text-foreground">
                    {formatDate(client.contract_start, { day: "numeric", month: "short", year: "numeric" })} — {formatDate(client.contract_end, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                {new Date(client.contract_end) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && new Date(client.contract_end) > new Date() && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
                    <AlertTriangle size={10} /> Akan habis dalam {Math.ceil((new Date(client.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} hari
                  </span>
                )}
                {new Date(client.contract_end) <= new Date() && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-danger/15 px-2 py-0.5 text-[10px] font-bold text-danger">
                    Expired
                  </span>
                )}
              </div>
            )}
            {financial.real_mrr > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-success/5 px-3 py-2">
                <DollarSign size={16} className="shrink-0 text-success" />
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-bold text-success sm:text-lg">{formatIDR(financial.real_mrr)}</span>
                  <span className="text-xs text-muted">/bulan (MRR)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section: CATATAN */}
        {client.notes && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">📝 Catatan</p>
            <p className="text-sm text-muted">{client.notes}</p>
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
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm",
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
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
        <div className="space-y-4">
          {/* Financial KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <div className="card p-3 sm:p-4">
              <TrendingUp className="mb-2 text-success" size={16} />
              <p className="text-base font-bold text-success sm:text-xl">{formatIDR(financial.real_mrr)}</p>
              <p className="text-xs text-muted">MRR (Real)</p>
              <p className="mt-0.5 text-[10px] text-muted">dari contract_services</p>
            </div>
            <div className="card p-3 sm:p-4">
              <AlertTriangle className={cn("mb-2", financial.outstanding > 0 ? "text-warning" : "text-muted")} size={16} />
              <p className={cn("text-base font-bold sm:text-xl", financial.outstanding > 0 ? "text-warning" : "text-muted")}>
                {formatIDR(financial.outstanding)}
              </p>
              <p className="text-xs text-muted">Outstanding</p>
              {financial.overdue_count > 0 && (
                <span className="mt-0.5 inline-block rounded bg-danger/10 px-1 text-[9px] font-bold text-danger">
                  {financial.overdue_count}x OVERDUE
                </span>
              )}
            </div>
            <div className="card p-3 sm:p-4">
              <CheckCircle className="mb-2 text-success" size={16} />
              <p className="text-base font-bold text-success sm:text-xl">{formatIDR(financial.paid_this_month)}</p>
              <p className="text-xs text-muted">Lunas Bulan Ini</p>
            </div>
            <div className="card p-3 sm:p-4">
              <Megaphone className="mb-2 text-primary" size={16} />
              <p className="text-base font-bold text-foreground sm:text-xl">
                {formatIDR(adAccounts.reduce((s, a) => s + (a.daily_budget || 0), 0))}
              </p>
              <p className="text-xs text-muted">Daily Ad Budget</p>
            </div>
          </div>

          {/* Operational KPIs */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="card p-3 sm:p-4">
              <CheckSquare className="mb-2 text-primary" size={16} />
              <p className="text-base font-bold text-foreground sm:text-xl">{tasks.length}</p>
              <p className="text-xs text-muted">Total Tasks</p>
            </div>
            <div className="card p-3 sm:p-4">
              <FileText className="mb-2 text-warning" size={16} />
              <p className="text-base font-bold text-foreground sm:text-xl">{reports.length}</p>
              <p className="text-xs text-muted">Weekly Reports</p>
            </div>
            <div className="card p-3 sm:p-4">
              <Target className="mb-2 text-accent" size={16} />
              <p className="text-base font-bold text-foreground sm:text-xl">{strategies.length}</p>
              <p className="text-xs text-muted">Strategies</p>
            </div>
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
              <button
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
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
              </button>
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
              <button
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className="block w-full rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(report.period_start, { day: "numeric", month: "short" })} —{" "}
                    {formatDate(report.period_end, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <span className="badge bg-background text-muted">{report.status}</span>
                </div>
                {report.summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{report.summary}</p>
                )}
              </button>
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
              <button
                key={strat.id}
                onClick={() => setSelectedStrategyId(strat.id)}
                className="block w-full rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <p className="text-sm font-medium text-foreground">{strat.title}</p>
                {strat.period && <p className="text-xs text-muted">{strat.period}</p>}
                {strat.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{strat.description}</p>
                )}
              </button>
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
                  <p className="text-sm font-medium text-foreground">
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

      {tab === "communication" && (
        <CommunicationLog clientId={client.id} />
      )}

      {tab === "content" && (
        <ClientContentTab clientId={client.id} />
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
                      <p className="text-sm text-foreground">{log.description}</p>
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10">
                <Trash size={18} className="text-danger" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Hapus Client?</h3>
                <p className="text-xs text-muted">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-muted">
              Yakin ingin menghapus <strong className="text-foreground">{client.name}</strong>? Semua data terkait
              (tasks, reports, strategies) mungkin terpengaruh.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={loadAll}
          onDeleted={loadAll}
        />
      )}

      {/* Report Detail Modal */}
      {selectedReportId && (
        <ReportDetailModal
          reportId={selectedReportId}
          onClose={() => setSelectedReportId(null)}
          onUpdated={loadAll}
          onDeleted={loadAll}
        />
      )}

      {/* Strategy Detail Modal */}
      {selectedStrategyId && (
        <StrategyDetailModal
          strategyId={selectedStrategyId}
          onClose={() => setSelectedStrategyId(null)}
          onUpdated={loadAll}
          onDeleted={loadAll}
        />
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
