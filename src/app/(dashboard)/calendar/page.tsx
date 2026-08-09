"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CheckSquare,
  FileText,
  DollarSign,
  CalendarClock,
  LayoutGrid,
  List,
  CalendarDays,
  AlertCircle,
  Clock,
  CheckCircle2,
  Plus,
  X,
  Video,
  MapPin,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
  status?: string;
  meta?: string;
  href: string;
  clientName?: string;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  client?: { name: string };
}
interface ReportRow {
  id: string;
  period_end: string;
  status: string;
  client?: { name: string };
}
interface InvoiceRow {
  id: string;
  invoice_number: string;
  due_date: string;
  amount: number;
  tax: number;
  status: string;
  client?: { name: string };
}
interface ClientRow {
  id: string;
  name: string;
  contract_end: string | null;
  status: string;
}

type ViewMode = "month" | "week" | "agenda";
type EventType = "task" | "report" | "invoice" | "contract" | "meeting";

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const WEEKDAYS_LONG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const typeConfig: Record<
  EventType,
  { dot: string; bg: string; icon: typeof CheckSquare; label: string; activeBg: string }
> = {
  task: {
    dot: "bg-primary",
    bg: "bg-primary/10",
    activeBg: "bg-primary text-white",
    icon: CheckSquare,
    label: "Task",
  },
  report: {
    dot: "bg-warning",
    bg: "bg-warning/10",
    activeBg: "bg-warning text-white",
    icon: FileText,
    label: "Report",
  },
  invoice: {
    dot: "bg-success",
    bg: "bg-success/10",
    activeBg: "bg-success text-white",
    icon: DollarSign,
    label: "Invoice",
  },
  contract: {
    dot: "bg-accent",
    bg: "bg-accent/10",
    activeBg: "bg-accent text-white",
    icon: CalendarClock,
    label: "Contract",
  },
  meeting: {
    dot: "bg-purple-500",
    bg: "bg-purple-500/10",
    activeBg: "bg-purple-500 text-white",
    icon: Users,
    label: "Meeting",
  },
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CalendarPage() {
  const supabase = createClient();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(
    dateStr(new Date())
  );
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(
    new Set<EventType>(["task", "report", "invoice", "contract", "meeting"])
  );
  const [showEventModal, setShowEventModal] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; full_name: string | null; email: string; division: string | null }[]>([]);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    event_type: "client_meeting" as "client_meeting" | "internal_meeting" | "review" | "follow_up" | "other",
    start_datetime: "",
    end_datetime: "",
    all_day: false,
    client_id: "",
    location: "",
    meeting_link: "",
    attendees: [] as string[],
    create_task_for_pm: false,
    pm_user_id: "",
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [tasks, reports, invoices, clients, calEvents, teamData, clientList] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, due_date, status, client:clients(name)")
          .not("due_date", "is", null)
          .order("due_date"),
        supabase
          .from("weekly_reports")
          .select("id, period_end, status, client:clients(name)")
          .order("period_end"),
        supabase
          .from("invoices")
          .select("id, invoice_number, due_date, amount, tax, status, client:clients(name)")
          .order("due_date"),
        supabase
          .from("clients")
          .select("id, name, contract_end, status")
          .not("contract_end", "is", null),
        supabase
          .from("calendar_events")
          .select("id, title, description, event_type, start_datetime, end_datetime, all_day, location, meeting_link, client:clients(name)")
          .order("start_datetime"),
        supabase
          .from("team_members")
          .select("id, full_name, email, division")
          .order("full_name"),
        supabase
          .from("clients")
          .select("id, name")
          .order("name"),
      ]);

      setTeamMembers((teamData.data as unknown as typeof teamMembers) || []);
      setClients((clientList.data as unknown as { id: string; name: string }[]) || []);

      const evts: CalendarEvent[] = [];

      ((tasks.data as unknown as TaskRow[]) || []).forEach((t) => {
        if (!t.due_date || t.status === "done" || t.status === "blocked") return;
        evts.push({
          id: `task-${t.id}`,
          date: t.due_date,
          title: t.title,
          type: "task",
          status: t.status,
          clientName: t.client?.name,
          href: "/tasks",
        });
      });

      ((reports.data as unknown as ReportRow[]) || []).forEach((r) => {
        if (!r.period_end || r.status === "approved") return;
        evts.push({
          id: `report-${r.id}`,
          date: r.period_end,
          title: `Report ${r.client?.name || ""}`.trim(),
          type: "report",
          status: r.status,
          clientName: r.client?.name,
          href: "/reports",
        });
      });

      ((invoices.data as unknown as InvoiceRow[]) || []).forEach((inv) => {
        if (!inv.due_date || inv.status === "paid" || inv.status === "cancelled") return;
        evts.push({
          id: `inv-${inv.id}`,
          date: inv.due_date,
          title: inv.invoice_number,
          type: "invoice",
          status: inv.status,
          meta: formatIDR(inv.amount + inv.tax),
          clientName: inv.client?.name,
          href: "/invoices",
        });
      });

      ((clients.data as unknown as ClientRow[]) || []).forEach((c) => {
        if (!c.contract_end || c.status !== "active") return;
        evts.push({
          id: `contract-${c.id}`,
          date: c.contract_end,
          title: `Kontrak ${c.name} berakhir`,
          type: "contract",
          clientName: c.name,
          href: `/clients/${c.id}`,
        });
      });

      // Calendar Events (meetings)
      interface CalEventRow {
        id: string; title: string; description: string | null;
        event_type: string; start_datetime: string; end_datetime: string | null;
        all_day: boolean; location: string | null; meeting_link: string | null;
        client?: { name: string };
      }
      ((calEvents.data as unknown as CalEventRow[]) || []).forEach((ev) => {
        const ds = ev.start_datetime?.slice(0, 10);
        if (!ds) return;
        evts.push({
          id: `meeting-${ev.id}`,
          date: ds,
          title: ev.title,
          type: "meeting",
          status: ev.event_type,
          clientName: ev.client?.name,
          href: "#",
        });
      });

      setEvents(evts);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

  // ============================================
  // Save Calendar Event
  // ============================================
  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventForm.title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (!eventForm.start_datetime) { toast.error("Waktu mulai wajib diisi"); return; }
    setSavingEvent(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const insertPayload = {
        title: eventForm.title.trim(),
        description: eventForm.description || null,
        event_type: eventForm.event_type,
        start_datetime: new Date(eventForm.start_datetime).toISOString(),
        end_datetime: eventForm.end_datetime ? new Date(eventForm.end_datetime).toISOString() : null,
        all_day: eventForm.all_day,
        client_id: eventForm.client_id || null,
        location: eventForm.location || null,
        meeting_link: eventForm.meeting_link || null,
        attendees: eventForm.attendees.map(uid => ({ user_id: uid })),
        created_by: user?.id || null,
      };
      const { data: newEvent, error } = await (supabase
        .from("calendar_events") as unknown as ReturnType<typeof supabase.from> extends never ? never : {
          insert: (p: typeof insertPayload) => { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
        };
      }).insert(insertPayload).select("id").single();

      if (error) throw error;

      // Optional: create task for PM
      if (eventForm.create_task_for_pm && eventForm.pm_user_id && (newEvent as { id?: string } | null)?.id) {
        const startDate = new Date(eventForm.start_datetime);
        const dueDate = startDate.toISOString().slice(0, 10);
        await supabase.from("tasks").insert({
          title: `[Meeting] ${eventForm.title.trim()}`,
          description: `Prepare untuk meeting: ${eventForm.title}\nWaktu: ${startDate.toLocaleString("id-ID")}\n${eventForm.location ? `Lokasi: ${eventForm.location}\n` : ""}${eventForm.meeting_link ? `Link: ${eventForm.meeting_link}` : ""}`,
          due_date: dueDate,
          status: "todo",
          priority: "medium",
          assignee_id: eventForm.pm_user_id,
          client_id: eventForm.client_id || null,
        } as never);
        toast.success("Meeting + task untuk PM dibuat!");
      } else {
        toast.success("Event meeting dibuat!");
      }

      setShowEventModal(false);
      setEventForm({
        title: "", description: "", event_type: "client_meeting",
        start_datetime: "", end_datetime: "", all_day: false,
        client_id: "", location: "", meeting_link: "",
        attendees: [], create_task_for_pm: false, pm_user_id: "",
      });
      loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal membuat event: " + msg);
    } finally {
      setSavingEvent(false);
    }
  }

  // ─── Filtered Events ───
  const filteredEvents = useMemo(() => {
    return events.filter((e) => activeFilters.has(e.type));
  }, [events, activeFilters]);

  // ─── Month Grid ───
  const { weeks, monthLabel } = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startOffset = first.getDay();
    const totalDays = last.getDate();

    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const weekRows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weekRows.push(cells.slice(i, i + 7));
    }

    const label = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(first);

    return { weeks: weekRows, monthLabel: label };
  }, [viewDate]);

  // ─── Week Grid (current week from viewDate) ───
  const weekDays = useMemo(() => {
    const d = new Date(viewDate);
    const dayOfWeek = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
      return day;
    });
  }, [viewDate]);

  const weekLabel = useMemo(() => {
    const start = weekDays[0];
    const end = weekDays[6];
    const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }, [weekDays]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [filteredEvents]);

  const todayStr = dateStr(new Date());

  const prevMonth = useCallback(() => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }, [viewDate]);
  const nextMonth = useCallback(() => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }, [viewDate]);
  const prevWeek = useCallback(() => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() - 7);
    setViewDate(d);
  }, [viewDate]);
  const nextWeek = useCallback(() => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + 7);
    setViewDate(d);
  }, [viewDate]);

  function goToday() {
    const t = new Date();
    setViewDate(t);
    setSelectedDate(dateStr(t));
  }

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  // ─── Upcoming Events (grouped) ───
  const upcomingByGroup = useMemo(() => {
    const upcoming = filteredEvents
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    const groups: { label: string; events: CalendarEvent[] }[] = [
      { label: "Hari Ini", events: [] },
      { label: "Besok", events: [] },
      { label: "Minggu Ini", events: [] },
      { label: "Mendatang", events: [] },
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    upcoming.forEach((e) => {
      const eventDate = new Date(e.date);
      eventDate.setHours(0, 0, 0, 0);
      const diff = Math.round(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diff === 0) groups[0].events.push(e);
      else if (diff === 1) groups[1].events.push(e);
      else if (diff <= 7) groups[2].events.push(e);
      else groups[3].events.push(e);
    });

    return groups.filter((g) => g.events.length > 0);
  }, [filteredEvents, todayStr]);

  // ─── Stats ───
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = dateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = dateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const monthEvents = filteredEvents.filter(
      (e) => e.date >= monthStart && e.date <= monthEnd
    );
    const urgentCount = filteredEvents.filter((e) => {
      const diff = Math.round(
        (new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return diff >= 0 && diff <= 2;
    }).length;
    const todayCount = (eventsByDate[todayStr] || []).length;
    const taskCount = filteredEvents.filter((e) => e.type === "task").length;
    const reportCount = filteredEvents.filter((e) => e.type === "report").length;
    const invoiceCount = filteredEvents.filter((e) => e.type === "invoice").length;
    const contractCount = filteredEvents.filter((e) => e.type === "contract").length;

    return {
      total: filteredEvents.length,
      thisMonth: monthEvents.length,
      urgent: urgentCount,
      today: todayCount,
      taskCount,
      reportCount,
      invoiceCount,
      contractCount,
    };
  }, [filteredEvents, eventsByDate, todayStr]);

  // ─── Filter Toggle ───
  function toggleFilter(type: EventType) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type); // min 1 active
      } else {
        next.add(type);
      }
      return next;
    });
  }

  // ─── Agenda Events (sorted list) ───
  const agendaEvents = useMemo(() => {
    return filteredEvents
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredEvents, todayStr]);

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Calendar</h1>
        <div className="skeleton h-[600px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Team Calendar</h1>
          <p className="text-sm text-muted">
            Aggregate deadlines: tasks, reports, invoices, contracts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5">
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "month"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-gray-900"
              )}
              title="Month View"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Month</span>
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "week"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-gray-900"
              )}
              title="Week View"
            >
              <CalendarDays size={14} />
              <span className="hidden sm:inline">Week</span>
            </button>
            <button
              onClick={() => setViewMode("agenda")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                viewMode === "agenda"
                  ? "bg-primary text-white"
                  : "text-muted hover:text-gray-900"
              )}
              title="Agenda View"
            >
              <List size={14} />
              <span className="hidden sm:inline">Agenda</span>
            </button>
          </div>
          <button onClick={goToday} className="btn-primary text-xs whitespace-nowrap">
            Hari Ini
          </button>
          <button onClick={() => setShowEventModal(true)} className="btn-primary text-xs whitespace-nowrap bg-purple-500 hover:bg-purple-600">
            <Plus size={14} /> <span className="hidden sm:inline">New Event</span><span className="sm:hidden">Event</span>
          </button>
        </div>
      </div>

      {/* ─── Stats Bar ─── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CalendarIcon className="text-primary" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{stats.total}</p>
            <p className="truncate text-[10px] text-muted">Total Event</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10">
            <AlertCircle className="text-danger" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{stats.urgent}</p>
            <p className="truncate text-[10px] text-muted">Urgent (≤2 hari)</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
            <Clock className="text-warning" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{stats.today}</p>
            <p className="truncate text-[10px] text-muted">Hari Ini</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
            <CheckCircle2 className="text-success" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{stats.thisMonth}</p>
            <p className="truncate text-[10px] text-muted">Bulan Ini</p>
          </div>
        </div>
      </div>

      {/* ─── Filter Chips (scrollable carousel) ─── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(typeConfig) as EventType[]).map((t) => {
          const cfg = typeConfig[t];
          const Icon = cfg.icon;
          const isActive = activeFilters.has(t);
          const count =
            t === "task" ? stats.taskCount :
            t === "report" ? stats.reportCount :
            t === "invoice" ? stats.invoiceCount :
            stats.contractCount;
          return (
            <button
              key={t}
              onClick={() => toggleFilter(t)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? cn(cfg.activeBg, "border-transparent")
                  : "border-border bg-surface text-muted hover:bg-background"
              )}
            >
              <Icon size={12} />
              {cfg.label}
              <span className={cn(
                "rounded-full px-1.5 text-[9px] font-bold",
                isActive ? "bg-white/20" : "bg-background"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Main Content ─── */}
      {viewMode === "agenda" ? (
        /* ═══ AGENDA VIEW ═══ */
        <div className="card p-4">
          <div className="mb-4 flex items-center gap-2">
            <List className="text-primary" size={18} />
            <h2 className="text-sm font-semibold text-gray-900">Agenda Mendatang</h2>
            <span className="badge bg-surface text-muted">{agendaEvents.length} items</span>
          </div>
          {agendaEvents.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="Tidak ada agenda mendatang"
              description="Deadline task, report, invoice, dan contract akan muncul di sini."
            />
          ) : (
            <div className="space-y-1.5">
              {agendaEvents.map((e) => {
                const cfg = typeConfig[e.type];
                const Icon = cfg.icon;
                const days = Math.round(
                  (new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                );
                const isUrgent = days <= 2;
                const isPast = days < 0;
                return (
                  <Link
                    key={e.id}
                    href={e.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary hover:bg-primary/5",
                      isPast && "opacity-50"
                    )}
                  >
                    {/* Date Block */}
                    <div className={cn(
                      "flex w-12 shrink-0 flex-col items-center rounded-md py-1.5",
                      isToday(e.date) ? cfg.activeBg : cfg.bg
                    )}>
                      <span className="text-[9px] font-medium uppercase opacity-80">
                        {new Date(e.date).toLocaleDateString("id-ID", { month: "short" })}
                      </span>
                      <span className="text-base font-bold leading-none">
                        {new Date(e.date).getDate()}
                      </span>
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Icon size={12} className="shrink-0 text-gray-600" />
                        <p className="truncate text-sm font-medium text-gray-900">{e.title}</p>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                        <span className="rounded bg-surface px-1 capitalize">{cfg.label}</span>
                        {e.clientName && <span className="truncate">{e.clientName}</span>}
                        {e.meta && <span>• {e.meta}</span>}
                        {e.status && (
                          <span className="rounded bg-surface px-1 capitalize">
                            {e.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Urgent Badge */}
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-1 text-[10px] font-bold",
                        isPast
                          ? "bg-surface text-muted"
                          : isUrgent
                            ? "bg-danger/10 text-danger"
                            : "bg-surface text-muted"
                      )}
                    >
                      {isPast
                        ? `${Math.abs(days)}h lalu`
                        : days === 0
                          ? "Hari ini"
                          : days === 1
                            ? "Besok"
                            : `${days}h`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══ MONTH & WEEK VIEW ═══ */
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Calendar Grid */}
          <div className="card lg:col-span-2">
            {/* Toolbar */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                {viewMode === "month" ? (
                  <span className="capitalize">{monthLabel}</span>
                ) : (
                  <span>{weekLabel}</span>
                )}
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={viewMode === "month" ? prevMonth : prevWeek}
                  className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-background hover:text-gray-900"
                  title={viewMode === "month" ? "Bulan sebelumnya" : "Minggu sebelumnya"}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={viewMode === "month" ? nextMonth : nextWeek}
                  className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-background hover:text-gray-900"
                  title={viewMode === "month" ? "Bulan berikutnya" : "Minggu berikutnya"}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "py-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                    i === 0 ? "text-danger" : i === 6 ? "text-primary" : "text-muted"
                  )}
                >
                  <span className="hidden sm:inline">{WEEKDAYS_LONG[i]}</span>
                  <span className="sm:hidden">{d}</span>
                </div>
              ))}
            </div>

            {viewMode === "month" ? (
              /* ─── Month Grid ─── */
              <div className="space-y-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="min-h-[70px] rounded-md bg-background/30 sm:min-h-[90px]" />;
                      const ds = dateStr(day);
                      const dayEvents = eventsByDate[ds] || [];
                      const isTodayCell = ds === todayStr;
                      const isSelected = ds === selectedDate;
                      const isWeekend = di === 0 || di === 6;
                      return (
                        <button
                          key={di}
                          onClick={() => setSelectedDate(ds)}
                          className={cn(
                            "min-h-[70px] rounded-md border p-1 text-left transition-all sm:min-h-[90px] sm:p-1.5",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-background hover:border-primary/50 hover:shadow-sm",
                            isWeekend && "bg-background/50"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={cn(
                                "flex h-5 w-5 items-center justify-center text-[11px] font-semibold sm:text-xs",
                                isTodayCell
                                  ? "rounded-full bg-primary text-white"
                                  : isWeekend
                                    ? "text-muted"
                                    : "text-gray-900"
                              )}
                            >
                              {day.getDate()}
                            </span>
                            {dayEvents.length > 0 && (
                              <span className={cn(
                                "rounded-full px-1 text-[8px] font-bold sm:text-[9px]",
                                dayEvents.length > 3 ? "bg-danger/10 text-danger" : "bg-surface text-muted"
                              )}>
                                {dayEvents.length}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 3).map((e) => (
                              <div
                                key={e.id}
                                className={cn(
                                  "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[8px] sm:text-[9px]",
                                  typeConfig[e.type].bg
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", typeConfig[e.type].dot)} />
                                <span className="truncate text-gray-900">{e.title}</span>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <p className="text-[8px] text-muted sm:text-[9px]">
                                +{dayEvents.length - 3} lagi
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              /* ─── Week Grid (vertical) ─── */
              <div className="space-y-1.5">
                {weekDays.map((day) => {
                  const ds = dateStr(day);
                  const dayEvents = eventsByDate[ds] || [];
                  const isTodayCell = ds === todayStr;
                  const isSelected = ds === selectedDate;
                  const dayOfWeek = day.getDay();
                  return (
                    <button
                      key={ds}
                      onClick={() => setSelectedDate(ds)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-all sm:p-3",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-background hover:border-primary/50",
                        isTodayCell && "ring-1 ring-primary"
                      )}
                    >
                      {/* Date Block */}
                      <div className={cn(
                        "flex w-12 shrink-0 flex-col items-center rounded-md py-1.5",
                        isTodayCell ? "bg-primary text-white" : "bg-surface text-gray-900"
                      )}>
                        <span className="text-[9px] font-medium uppercase opacity-80">
                          {WEEKDAYS[dayOfWeek]}
                        </span>
                        <span className="text-lg font-bold leading-none">
                          {day.getDate()}
                        </span>
                      </div>
                      {/* Events */}
                      <div className="min-w-0 flex-1">
                        {dayEvents.length === 0 ? (
                          <p className="py-2 text-xs text-muted">Tidak ada event</p>
                        ) : (
                          <div className="space-y-1">
                            {dayEvents.map((e) => {
                              const cfg = typeConfig[e.type];
                              const Icon = cfg.icon;
                              return (
                                <div
                                  key={e.id}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                                    cfg.bg
                                  )}
                                >
                                  <Icon size={10} className="shrink-0 text-gray-700" />
                                  <span className="truncate text-gray-900">{e.title}</span>
                                  {e.clientName && (
                                    <span className="ml-auto shrink-0 text-[9px] text-muted">
                                      {e.clientName}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Sidebar ─── */}
          <div className="space-y-4">
            {/* Selected Date Detail */}
            <div className="card">
              <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold text-gray-900">
                {selectedDate
                  ? new Intl.DateTimeFormat("id-ID", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(new Date(selectedDate))
                  : "Pilih Tanggal"}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">
                  {selectedDate ? "Tidak ada event" : "Klik tanggal untuk lihat detail"}
                </p>
              ) : (
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {selectedEvents.map((e) => {
                    const cfg = typeConfig[e.type];
                    const Icon = cfg.icon;
                    return (
                      <Link
                        key={e.id}
                        href={e.href}
                        className="flex items-start gap-2 rounded-md border border-border bg-background p-2 transition-colors hover:border-primary hover:bg-primary/5"
                      >
                        <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded", cfg.bg)}>
                          <Icon size={12} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-900">{e.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                            {e.clientName && <span className="truncate">{e.clientName}</span>}
                            {e.meta && <span>• {e.meta}</span>}
                            {e.status && (
                              <span className="rounded bg-surface px-1 capitalize">
                                {e.status.replace("_", " ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upcoming Deadlines (Grouped) */}
            <div className="card">
              <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                <CalendarIcon className="text-primary" size={16} />
                <h3 className="text-sm font-semibold text-gray-900">Deadline Mendatang</h3>
              </div>
              {upcomingByGroup.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <CalendarIcon className="text-muted" size={24} />
                  <p className="mt-2 text-xs text-muted">Tidak ada deadline mendatang</p>
                </div>
              ) : (
                <div className="max-h-[400px] space-y-3 overflow-y-auto">
                  {upcomingByGroup.map((group) => (
                    <div key={group.label}>
                      <p className={cn(
                        "mb-1.5 text-[10px] font-bold uppercase tracking-wide",
                        group.label === "Hari Ini"
                          ? "text-danger"
                          : group.label === "Besok"
                            ? "text-warning"
                            : "text-muted"
                      )}>
                        {group.label} ({group.events.length})
                      </p>
                      <div className="space-y-1">
                        {group.events.map((e) => {
                          const cfg = typeConfig[e.type];
                          const Icon = cfg.icon;
                          const days = Math.round(
                            (new Date(e.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                          );
                          const isUrgent = days <= 2;
                          return (
                            <Link
                              key={e.id}
                              href={e.href}
                              className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-background"
                            >
                              <div className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                                cfg.bg
                              )}>
                                <Icon size={9} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-gray-900">{e.title}</p>
                                <p className="truncate text-[10px] text-muted">{e.clientName}</p>
                              </div>
                              {isUrgent && (
                                <span className="shrink-0 rounded bg-danger/10 px-1 py-0.5 text-[9px] font-bold text-danger">
                                  {days === 0 ? "Hari ini" : days === 1 ? "Besok" : `${days}h`}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Event Modal ═══ */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowEventModal(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Users size={20} className="text-purple-500" />
                Buat Event / Meeting
              </h2>
              <button onClick={() => setShowEventModal(false)} className="text-muted hover:text-gray-900">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveEvent} className="space-y-3 p-4">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Judul Event <span className="text-danger">*</span></label>
                <input
                  type="text"
                  required
                  value={eventForm.title}
                  onChange={e => setEventForm({ ...eventForm, title: e.target.value })}
                  placeholder="cth: Monthly Meeting dengan Client X"
                  className="input"
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tipe Event</label>
                <select
                  value={eventForm.event_type}
                  onChange={e => setEventForm({ ...eventForm, event_type: e.target.value as typeof eventForm.event_type })}
                  className="input"
                >
                  <option value="client_meeting">Meeting dengan Client</option>
                  <option value="internal_meeting">Meeting Internal</option>
                  <option value="review">Review</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>

              {/* Client */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Client (opsional)</label>
                <select
                  value={eventForm.client_id}
                  onChange={e => setEventForm({ ...eventForm, client_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Pilih Client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Mulai <span className="text-danger">*</span></label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.start_datetime}
                    onChange={e => setEventForm({ ...eventForm, start_datetime: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Selesai</label>
                  <input
                    type="datetime-local"
                    value={eventForm.end_datetime}
                    onChange={e => setEventForm({ ...eventForm, end_datetime: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {/* All Day */}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={eventForm.all_day}
                  onChange={e => setEventForm({ ...eventForm, all_day: e.target.checked })}
                  className="rounded"
                />
                <span className="text-gray-700">Sepanjang hari</span>
              </label>

              {/* Location & Link */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 flex items-center gap-1">
                    <MapPin size={12} /> Lokasi
                  </label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={e => setEventForm({ ...eventForm, location: e.target.value })}
                    placeholder="cth: Kantor Hadona"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700 flex items-center gap-1">
                    <Video size={12} /> Meeting Link
                  </label>
                  <input
                    type="url"
                    value={eventForm.meeting_link}
                    onChange={e => setEventForm({ ...eventForm, meeting_link: e.target.value })}
                    placeholder="https://meet.google.com/..."
                    className="input"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Deskripsi / Agenda</label>
                <textarea
                  value={eventForm.description}
                  onChange={e => setEventForm({ ...eventForm, description: e.target.value })}
                  rows={2}
                  placeholder="Agenda meeting..."
                  className="input resize-none"
                />
              </div>

              {/* Auto-create task for PM */}
              <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={eventForm.create_task_for_pm}
                    onChange={e => setEventForm({ ...eventForm, create_task_for_pm: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-purple-900">Assign task preparation ke PM/Team</span>
                </label>
                {eventForm.create_task_for_pm && (
                  <select
                    value={eventForm.pm_user_id}
                    onChange={e => setEventForm({ ...eventForm, pm_user_id: e.target.value })}
                    className="input text-xs"
                  >
                    <option value="">— Pilih anggota tim —</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.full_name || m.email} {m.division ? `(${m.division})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="btn-secondary text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="btn-primary text-xs bg-purple-500 hover:bg-purple-600 disabled:opacity-50"
                >
                  {savingEvent ? (
                    <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
                  ) : (
                    <><Plus size={14} /> Buat Event</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper ───
function isToday(dateString: string): boolean {
  return dateString === dateStr(new Date());
}