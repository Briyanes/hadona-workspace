"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
  CheckSquare,
  FileText,
  DollarSign,
  CalendarClock,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: "task" | "report" | "invoice" | "contract";
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

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const typeConfig: Record<
  CalendarEvent["type"],
  { dot: string; bg: string; icon: typeof CheckSquare; label: string }
> = {
  task: { dot: "bg-primary", bg: "bg-primary/10", icon: CheckSquare, label: "Task" },
  report: { dot: "bg-warning", bg: "bg-warning/10", icon: FileText, label: "Report" },
  invoice: { dot: "bg-success", bg: "bg-success/10", icon: DollarSign, label: "Invoice" },
  contract: { dot: "bg-accent", bg: "bg-accent/10", icon: CalendarClock, label: "Contract" },
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const [tasks, reports, invoices, clients] = await Promise.all([
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
      ]);

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

      setEvents(evts);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }

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

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const todayStr = dateStr(new Date());

  function prevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }
  function goToday() {
    setViewDate(new Date());
    setSelectedDate(todayStr);
  }

  const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];
  const upcomingEvents = useMemo(() => {
    return events
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [events, todayStr]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { task: 0, report: 0, invoice: 0, contract: 0 };
    events.forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Calendar</h1>
        <div className="skeleton h-[600px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Team Calendar</h1>
          <p className="text-sm text-muted">
            Aggregate deadlines: tasks, reports, invoices, contracts
          </p>
        </div>
        <button onClick={goToday} className="btn-primary text-xs">
          Hari Ini
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold capitalize text-gray-900">{monthLabel}</h2>
            <div className="flex gap-1">
              <button
                onClick={prevMonth}
                className="rounded-md border border-border p-1.5 text-muted hover:bg-background hover:text-gray-900"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={nextMonth}
                className="rounded-md border border-border p-1.5 text-muted hover:bg-background hover:text-gray-900"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="min-h-[80px] rounded-md bg-background/30" />;
                  const ds = dateStr(day);
                  const dayEvents = eventsByDate[ds] || [];
                  const isToday = ds === todayStr;
                  const isSelected = ds === selectedDate;
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDate(ds)}
                      className={cn(
                        "min-h-[80px] rounded-md border p-1.5 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background hover:border-primary/50",
                        isToday && "ring-1 ring-primary"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            "text-xs font-medium",
                            isToday ? "rounded-full bg-primary px-1.5 text-white" : "text-gray-900"
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="rounded-full bg-surface px-1.5 text-[9px] font-bold text-muted">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <div
                            key={e.id}
                            className={cn(
                              "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[9px]",
                              typeConfig[e.type].bg
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", typeConfig[e.type].dot)} />
                            <span className="truncate text-gray-900">{e.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <p className="text-[9px] text-muted">+{dayEvents.length - 2} lagi</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3">
            {(Object.keys(typeConfig) as CalendarEvent["type"][]).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <div key={t} className="flex items-center gap-1.5">
                  <div className={cn("flex h-5 w-5 items-center justify-center rounded", cfg.bg)}>
                    <Icon size={10} className="text-gray-700" />
                  </div>
                  <span className="text-xs text-muted">
                    {cfg.label} ({typeCounts[t] || 0})
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
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
              <div className="space-y-2">
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

          <div className="card">
            <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
              <CalendarIcon className="text-primary" size={16} />
              <h3 className="text-sm font-semibold text-gray-900">Deadline Mendatang</h3>
            </div>
            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                {loading ? (
                  <Loader2 className="animate-spin text-muted" size={20} />
                ) : (
                  <CalendarIcon className="text-muted" size={24} />
                )}
                <p className="mt-2 text-xs text-muted">Tidak ada deadline mendatang</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingEvents.map((e) => {
                  const cfg = typeConfig[e.type];
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
                      <div className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cfg.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gray-900">{e.title}</p>
                        <p className="text-[10px] text-muted">{e.clientName}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1 py-0.5 text-[9px] font-medium",
                          isUrgent ? "bg-danger/10 text-danger" : "bg-surface text-muted"
                        )}
                      >
                        {days === 0 ? "Hari ini" : days === 1 ? "Besok" : `${days}h`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}