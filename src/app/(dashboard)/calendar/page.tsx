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
  Copy,
  MessageCircle,
  Pencil,
  Trash2,
  CalendarX,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn, formatIDR, stripUrls } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  type: EventType;
  status?: string;
  meta?: string;
  href: string;
  clientName?: string;
  // Meeting-specific fields (for reschedule/cancel)
  rawId?: string;
  googleEventId?: string;
  meetingLink?: string | null;
  description?: string | null;
  location?: string | null;
  startDatetime?: string;
  endDatetime?: string | null;
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
  const [clients, setClients] = useState<{ id: string; name: string; contact_email: string | null; contact_phone: string | null }[]>([]);
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
    auto_generate_meet: true,
  });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [meetSuccess, setMeetSuccess] = useState<{
    link: string;
    clientName: string | null;
    clientPhone: string | null;
    clientEmail: string | null;
  } | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({ start_datetime: "", end_datetime: "" });

  useEffect(() => {
    loadAll();
    // Check Google connected status
    fetch("/api/google/status").then(res => res.json()).then(data => {
      setGoogleConnected(!!data.connected);
    }).catch(() => {});
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
          .select("id, title, description, event_type, start_datetime, end_datetime, all_day, location, meeting_link, google_event_id, status, client:clients(name)")
          .order("start_datetime"),
        supabase
          .from("profiles")
          .select("id, full_name, email, division")
          .eq("is_active", true)
          .order("full_name"),
        supabase
          .from("clients")
          .select("id, name, contact_email, contact_phone")
          .order("name"),
      ]);

      setTeamMembers((teamData.data as unknown as typeof teamMembers) || []);
      setClients((clientList.data as unknown as { id: string; name: string; contact_email: string | null; contact_phone: string | null }[]) || []);

      const evts: CalendarEvent[] = [];

      ((tasks.data as unknown as TaskRow[]) || []).forEach((t) => {
        if (!t.due_date || t.status === "done" || t.status === "blocked") return;
        evts.push({
          id: `task-${t.id}`,
          date: t.due_date,
          title: stripUrls(t.title) || "(Link)",
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
        google_event_id: string | null; status: string | null;
        client?: { name: string };
      }
      ((calEvents.data as unknown as CalEventRow[]) || []).forEach((ev) => {
        // Skip cancelled meetings
        if (ev.status === "cancelled") return;
        const ds = ev.start_datetime?.slice(0, 10);
        if (!ds) return;
        evts.push({
          id: `meeting-${ev.id}`,
          rawId: ev.id,
          date: ds,
          title: ev.title,
          type: "meeting",
          status: ev.event_type,
          clientName: ev.client?.name,
          href: "#",
          googleEventId: ev.google_event_id || undefined,
          meetingLink: ev.meeting_link,
          description: ev.description,
          location: ev.location,
          startDatetime: ev.start_datetime,
          endDatetime: ev.end_datetime,
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

      // ─── Collect attendee emails (PM + client if they have email) ───
      const attendeesEmails: string[] = [];
      let clientEmail: string | null = null;
      let clientPhone: string | null = null;
      let clientName: string | null = null;

      if (eventForm.client_id) {
        const selectedClient = clients.find(c => c.id === eventForm.client_id);
        if (selectedClient) {
          clientName = selectedClient.name;
          clientEmail = selectedClient.contact_email || null;
          clientPhone = selectedClient.contact_phone || null;
          if (clientEmail) attendeesEmails.push(clientEmail);
        }
      }
      if (eventForm.create_task_for_pm && eventForm.pm_user_id) {
        const pm = teamMembers.find(t => t.id === eventForm.pm_user_id);
        if (pm?.email) attendeesEmails.push(pm.email);
      }

      // Auto-generate Google Meet if enabled & connected
      let finalMeetingLink = eventForm.meeting_link;
      let finalGoogleEventId: string | null = null;
      if (eventForm.auto_generate_meet && googleConnected && !eventForm.all_day) {
        try {
          const meetRes = await fetch("/api/google/create-meet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: eventForm.title.trim(),
              description: eventForm.description,
              start_datetime: eventForm.start_datetime,
              end_datetime: eventForm.end_datetime,
              location: eventForm.location,
              attendees_emails: attendeesEmails,
            }),
          });
          if (meetRes.ok) {
            const meetData = await meetRes.json();
            finalMeetingLink = meetData.google_meet_code || finalMeetingLink;
            finalGoogleEventId = meetData.google_event_id || null;
            if (clientEmail) {
              toast.success("✅ Meet dibuat! Invite otomatis dikirim ke email client.");
            } else {
              toast.success("Meet link di-generate. Copy link untuk client via WA.");
            }
          }
        } catch {
          toast.warning("Gagal generate Meet link, lanjut tanpa link");
        }
      }

      const insertPayload = {
        title: eventForm.title.trim(),
        description: eventForm.description || null,
        event_type: eventForm.event_type,
        start_datetime: new Date(eventForm.start_datetime).toISOString(),
        end_datetime: eventForm.end_datetime ? new Date(eventForm.end_datetime).toISOString() : null,
        all_day: eventForm.all_day,
        client_id: eventForm.client_id || null,
        location: eventForm.location || null,
        meeting_link: finalMeetingLink || null,
        google_event_id: finalGoogleEventId,
        attendees: eventForm.attendees.map(uid => ({ user_id: uid })),
        created_by: user?.id || null,
      };
      const { data: newEvent, error } = await supabase
        .from("calendar_events")
        .insert(insertPayload as never)
        .select("id")
        .single();

      if (error) {
        // Extract real error message from Supabase (it's NOT an Error instance)
        const supaErr = error as { message?: string; details?: string; hint?: string; code?: string };
        const errMsg = supaErr.message || supaErr.details || supaErr.hint || `DB Error (${supaErr.code || "unknown"})`;
        console.error("[Calendar] Insert calendar_events failed:", JSON.stringify(error, null, 2));
        throw new Error(errMsg);
      }

      const eventId = (newEvent as { id?: string } | null)?.id;

      // ✅ Event successfully created — close modal & reset immediately
      setShowEventModal(false);
      setEventForm({
        title: "", description: "", event_type: "client_meeting",
        start_datetime: "", end_datetime: "", all_day: false,
        client_id: "", location: "", meeting_link: "",
        attendees: [], create_task_for_pm: false, pm_user_id: "",
        auto_generate_meet: true,
      });

      if (eventForm.create_task_for_pm && eventForm.pm_user_id && eventId) {
        toast.success("Event meeting dibuat! Membuat task untuk PM...");
      } else {
        toast.success("Event meeting dibuat!");
      }
      loadAll();

      // ─── Show success modal with Meet link + WA shortcut ───
      if (finalMeetingLink) {
        setMeetSuccess({
          link: finalMeetingLink,
          clientName,
          clientPhone,
          clientEmail,
        });
      }

      // Optional: create task for PM via server-side API (bypass RLS)
      if (eventForm.create_task_for_pm && eventForm.pm_user_id && eventId) {
        try {
          const startDate = new Date(eventForm.start_datetime);
          const dueDate = startDate.toISOString().slice(0, 10);

          const taskRes = await fetch("/api/calendar/create-task", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `[Meeting] ${eventForm.title.trim()}`,
              description: `Prepare untuk meeting: ${eventForm.title}\nWaktu: ${startDate.toLocaleString("id-ID")}\n${eventForm.location ? `Lokasi: ${eventForm.location}\n` : ""}${finalMeetingLink ? `Link: ${finalMeetingLink}` : ""}`,
              due_date: dueDate,
              client_id: eventForm.client_id || null,
              pm_user_id: eventForm.pm_user_id,
              event_id: eventId,
              created_by: user?.id || null,
            }),
          });

          const taskResult = await taskRes.json();

          if (!taskRes.ok) {
            console.error("[Calendar] API create-task failed:", taskResult);
            toast.warning("Event tersimpan, tapi gagal buat task PM: " + (taskResult.error || taskResult.details || "Unknown error"));
          } else if (taskResult.warning) {
            toast.warning(taskResult.warning);
          } else {
            toast.success("Meeting + task untuk PM dibuat!");
          }
        } catch (taskErr) {
          console.error("[Calendar] Task creation exception:", taskErr);
          toast.warning("Event tersimpan, tapi gagal buat task PM. Event tetap ada di calendar.");
        }
      }
    } catch (err) {
      // Extract real error message — Supabase errors are plain objects, NOT Error instances
      let msg = "Unknown error";
      if (err instanceof Error) {
        msg = err.message;
      } else if (err && typeof err === "object") {
        const e = err as { message?: string; details?: string; hint?: string; error_description?: string };
        msg = e.message || e.details || e.hint || e.error_description || JSON.stringify(err);
      } else if (typeof err === "string") {
        msg = err;
      }
      console.error("[Calendar] handleSaveEvent failed:", msg, err);
      toast.error("Gagal membuat event: " + msg);
    } finally {
      setSavingEvent(false);
    }
  }

  // ============================================
  // Reschedule Meeting
  // ============================================
  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!detailEvent?.rawId || !rescheduleForm.start_datetime) {
      toast.error("Data tidak lengkap");
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: detailEvent.rawId,
          start_datetime: rescheduleForm.start_datetime,
          end_datetime: rescheduleForm.end_datetime || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reschedule");
      toast.success("✅ Meeting rescheduled! Email otomatis dikirim ke attendees.");
      setShowReschedule(false);
      setDetailEvent(null);
      loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal reschedule: " + msg);
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================
  // Cancel Meeting
  // ============================================
  async function handleCancelMeeting() {
    if (!detailEvent?.rawId) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: detailEvent.rawId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      toast.success("❌ Meeting dibatalkan. Email otomatis dikirim ke attendees.");
      setShowCancelConfirm(false);
      setDetailEvent(null);
      loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal batalkan: " + msg);
    } finally {
      setActionLoading(false);
    }
  }

  // ============================================
  // Open Reschedule Form (pre-filled)
  // ============================================
  function openReschedule(ev: CalendarEvent) {
    if (!ev.startDatetime) return;
    const start = new Date(ev.startDatetime);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const startLocal = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}T${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
    let endLocal = "";
    if (ev.endDatetime) {
      const end = new Date(ev.endDatetime);
      endLocal = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}T${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
    }
    setRescheduleForm({ start_datetime: startLocal, end_datetime: endLocal });
    setShowReschedule(true);
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
    const meetingCount = filteredEvents.filter((e) => e.type === "meeting").length;

    return {
      total: filteredEvents.length,
      thisMonth: monthEvents.length,
      urgent: urgentCount,
      today: todayCount,
      taskCount,
      reportCount,
      invoiceCount,
      contractCount,
      meetingCount,
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
        <h1 className="text-2xl font-bold text-foreground">Team Calendar</h1>
        <div className="skeleton h-[600px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Team Calendar</h1>
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
                  : "text-muted hover:text-foreground"
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
                  : "text-muted hover:text-foreground"
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
                  : "text-muted hover:text-foreground"
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
            <p className="text-lg font-bold text-foreground">{stats.total}</p>
            <p className="truncate text-[10px] text-muted">Total Event</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-danger/10">
            <AlertCircle className="text-danger" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{stats.urgent}</p>
            <p className="truncate text-[10px] text-muted">Urgent (≤2 hari)</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
            <Clock className="text-warning" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{stats.today}</p>
            <p className="truncate text-[10px] text-muted">Hari Ini</p>
          </div>
        </div>
        <div className="card flex items-center gap-2.5 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10">
            <CheckCircle2 className="text-success" size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground">{stats.thisMonth}</p>
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
            t === "contract" ? stats.contractCount :
            stats.meetingCount;
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
            <h2 className="text-sm font-semibold text-foreground">Agenda Mendatang</h2>
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
                const AgendaWrapper = (props: { children: React.ReactNode; className?: string }) => {
                  if (e.type === "meeting" && e.rawId) {
                    return (
                      <button onClick={() => setDetailEvent(e)} className={props.className}>
                        {props.children}
                      </button>
                    );
                  }
                  return (
                    <Link href={e.href} className={props.className}>
                      {props.children}
                    </Link>
                  );
                };
                return (
                  <AgendaWrapper
                    key={e.id}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary hover:bg-primary/5",
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
                        <Icon size={12} className="shrink-0 text-muted" />
                        <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
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
                  </AgendaWrapper>
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
              <h2 className="text-base font-bold text-foreground sm:text-lg">
                {viewMode === "month" ? (
                  <span className="capitalize">{monthLabel}</span>
                ) : (
                  <span>{weekLabel}</span>
                )}
              </h2>
              <div className="flex gap-1">
                <button
                  onClick={viewMode === "month" ? prevMonth : prevWeek}
                  className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
                  title={viewMode === "month" ? "Bulan sebelumnya" : "Minggu sebelumnya"}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={viewMode === "month" ? nextMonth : nextWeek}
                  className="rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
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
                                    : "text-foreground"
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
                                <span className="truncate text-foreground">{e.title}</span>
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
                        isTodayCell ? "bg-primary text-white" : "bg-surface text-foreground"
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
                                  <Icon size={10} className="shrink-0 text-muted" />
                                  <span className="truncate text-foreground">{e.title}</span>
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
              <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold text-foreground">
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
                    const EventWrapper = (props: { children: React.ReactNode; className?: string }) => {
                      if (e.type === "meeting" && e.rawId) {
                        return (
                          <button
                            onClick={() => setDetailEvent(e)}
                            className={props.className}
                          >
                            {props.children}
                          </button>
                        );
                      }
                      return (
                        <Link href={e.href} className={props.className}>
                          {props.children}
                        </Link>
                      );
                    };
                    return (
                      <EventWrapper
                        key={e.id}
                        className="flex items-start gap-2 rounded-md border border-border bg-background p-2 transition-colors hover:border-primary hover:bg-primary/5"
                      >
                        <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded", cfg.bg)}>
                          <Icon size={12} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">{e.title}</p>
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
                      </EventWrapper>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upcoming Deadlines (Grouped) */}
            <div className="card">
              <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                <CalendarIcon className="text-primary" size={16} />
                <h3 className="text-sm font-semibold text-foreground">Deadline Mendatang</h3>
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
                          const UpcomingWrapper = (props: { children: React.ReactNode; className?: string }) => {
                            if (e.type === "meeting" && e.rawId) {
                              return (
                                <button onClick={() => setDetailEvent(e)} className={props.className}>
                                  {props.children}
                                </button>
                              );
                            }
                            return (
                              <Link href={e.href} className={props.className}>
                                {props.children}
                              </Link>
                            );
                          };
                          return (
                            <UpcomingWrapper
                              key={e.id}
                              className="flex w-full items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-background"
                            >
                              <div className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                                cfg.bg
                              )}>
                                <Icon size={9} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs text-foreground">{e.title}</p>
                                <p className="truncate text-[10px] text-muted">{e.clientName}</p>
                              </div>
                              {isUrgent && (
                                <span className="shrink-0 rounded bg-danger/10 px-1 py-0.5 text-[9px] font-bold text-danger">
                                  {days === 0 ? "Hari ini" : days === 1 ? "Besok" : `${days}h`}
                                </span>
                              )}
                            </UpcomingWrapper>
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

      {/* ═══ Meet Success Modal ═══ */}
      {meetSuccess && (
        <Modal
          open
          onClose={() => setMeetSuccess(null)}
          title="Meeting Berhasil Dibuat!"
          size="sm"
          footer={
            <button onClick={() => setMeetSuccess(null)} className="btn-primary text-xs">
              Selesai
            </button>
          }
        >
          <div className="space-y-3">
              {/* Meet Link */}
              {meetSuccess.link && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">🔗 Google Meet Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={meetSuccess.link}
                      className="input flex-1 text-xs"
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(meetSuccess.link);
                        toast.success("Link disalin ke clipboard!");
                      }}
                      className="btn-secondary text-xs whitespace-nowrap"
                    >
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Invite status: email sent OR WA fallback */}
              {meetSuccess.clientEmail ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800">
                  ✅ Invite Google Meet sudah dikirim ke email <strong>{meetSuccess.clientName}</strong> ({meetSuccess.clientEmail})
                </div>
              ) : meetSuccess.clientPhone ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-2.5 text-xs text-yellow-800">
                    ⚠️ Client tidak punya email. Copy link di atas, lalu kirim via WhatsApp.
                  </div>
                  <a
                    href={`https://wa.me/${meetSuccess.clientPhone.replace(/[^0-9]/g, "").replace(/^0/, "62")}?text=Halo ${encodeURIComponent(meetSuccess.clientName || "")}, berikut link meeting kita: ${encodeURIComponent(meetSuccess.link)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full justify-center text-xs bg-green-500 hover:bg-green-600"
                  >
                    <MessageCircle size={14} /> Buka WhatsApp Client
                  </a>
                </div>
              ) : (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
                  📋 Copy link di atas untuk dibagikan ke peserta meeting.
                </div>
              )}

          </div>
        </Modal>
      )}

      {/* ═══ Event Modal ═══ */}
      {showEventModal && (
        <Modal
          open
          onClose={() => setShowEventModal(false)}
          title="Buat Event / Meeting"
          size="md"
          scrollable
        >
          <form onSubmit={handleSaveEvent} className="space-y-3">
              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Judul Event <span className="text-danger">*</span></label>
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
                <label className="mb-1 block text-xs font-medium text-muted">Tipe Event</label>
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
                <label className="mb-1 block text-xs font-medium text-muted">Client (opsional)</label>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Mulai <span className="text-danger">*</span></label>
                  <input
                    type="datetime-local"
                    required
                    value={eventForm.start_datetime}
                    onChange={e => setEventForm({ ...eventForm, start_datetime: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Selesai</label>
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
                <span className="text-muted">Sepanjang hari</span>
              </label>

              {/* Location & Link */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted flex items-center gap-1">
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
                  <label className="mb-1 block text-xs font-medium text-muted flex items-center gap-1">
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

              {/* Auto-generate Google Meet */}
              {googleConnected && !eventForm.all_day && (
                <label className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={eventForm.auto_generate_meet}
                    onChange={e => setEventForm({ ...eventForm, auto_generate_meet: e.target.checked })}
                    className="rounded"
                  />
                  <Video size={14} className="text-blue-600" />
                  <span className="text-blue-900">Auto-generate Google Meet link</span>
                </label>
              )}
              {!googleConnected && !eventForm.all_day && (
                <p className="text-[10px] text-muted">
                  💡 Hubungkan Google Calendar di Settings → Integrations untuk auto-generate Meet link
                </p>
              )}

              {/* Description */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Deskripsi / Agenda</label>
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
        </Modal>
      )}

      {/* ═══ Meeting Detail Modal ═══ */}
      {detailEvent && !showReschedule && !showCancelConfirm && (
        <Modal open onClose={() => setDetailEvent(null)} title="Detail Meeting" size="sm">
          <div className="space-y-3">
              {/* Title */}
              <div>
                <p className="text-sm font-bold text-foreground">{detailEvent.title}</p>
                {detailEvent.status && (
                  <span className="mt-0.5 inline-block rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-purple-700">
                    {detailEvent.status.replace("_", " ")}
                  </span>
                )}
              </div>

              {/* Client */}
              {detailEvent.clientName && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted">Client:</span>
                  <span className="font-medium text-foreground">{detailEvent.clientName}</span>
                </div>
              )}

              {/* DateTime */}
              {detailEvent.startDatetime && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock size={14} className="text-muted" />
                  <span className="text-muted">
                    {new Date(detailEvent.startDatetime).toLocaleString("id-ID", {
                      weekday: "long", day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                    {detailEvent.endDatetime && (
                      <> — {new Date(detailEvent.endDatetime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</>
                    )}
                  </span>
                </div>
              )}

              {/* Location */}
              {detailEvent.location && (
                <div className="flex items-center gap-2 text-xs">
                  <MapPin size={14} className="text-muted" />
                  <span className="text-muted">{detailEvent.location}</span>
                </div>
              )}

              {/* Meeting Link */}
              {detailEvent.meetingLink && (
                <div className="flex items-center gap-2 text-xs">
                  <Video size={14} className="text-muted" />
                  <a
                    href={detailEvent.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    Join Google Meet <ExternalLink size={10} />
                  </a>
                </div>
              )}

              {/* Description */}
              {detailEvent.description && (
                <div className="rounded-md bg-background p-2.5 text-xs text-muted">
                  <p className="mb-1 font-medium text-foreground">Agenda:</p>
                  {detailEvent.description}
                </div>
              )}

              {/* Google sync indicator */}
              {detailEvent.googleEventId && (
                <div className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 p-2 text-[10px] text-green-700">
                  <CheckCircle2 size={12} />
                  Tersinkron dengan Google Calendar — reschedule/cancel otomatis update & notify attendees.
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 border-t border-border pt-3">
                <button
                  onClick={() => openReschedule(detailEvent)}
                  disabled={actionLoading}
                  className="btn-secondary flex-1 justify-center text-xs disabled:opacity-50"
                >
                  <Pencil size={14} /> Reschedule
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={actionLoading}
                  className="btn-secondary flex-1 justify-center text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <CalendarX size={14} /> Batalkan
                </button>
              </div>
          </div>
        </Modal>
      )}

      {/* ═══ Reschedule Modal ═══ */}
      {detailEvent && showReschedule && (
        <Modal
          open
          onClose={() => { setShowReschedule(false); setDetailEvent(null); }}
          title="Reschedule Meeting"
          size="sm"
        >
          <form onSubmit={handleReschedule} className="space-y-3">
              <p className="text-xs text-muted">
                {detailEvent.googleEventId
                  ? "📅 Meeting di Google Calendar akan otomatis diupdate, dan email notifikasi dikirim ke semua attendees."
                  : "Jadwal meeting akan diupdate."}
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Waktu Mulai Baru <span className="text-danger">*</span></label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleForm.start_datetime}
                  onChange={e => setRescheduleForm({ ...rescheduleForm, start_datetime: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Waktu Selesai Baru</label>
                <input
                  type="datetime-local"
                  value={rescheduleForm.end_datetime}
                  onChange={e => setRescheduleForm({ ...rescheduleForm, end_datetime: e.target.value })}
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button type="button" onClick={() => setShowReschedule(false)} className="btn-secondary text-xs">
                  Batal
                </button>
                <button type="submit" disabled={actionLoading} className="btn-primary text-xs bg-warning hover:bg-orange-600 disabled:opacity-50">
                  {actionLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
                  ) : (
                    <><Pencil size={14} /> Reschedule</>
                  )}
                </button>
              </div>
          </form>
        </Modal>
      )}

      {/* ═══ Cancel Confirmation Modal ═══ */}
      {detailEvent && showCancelConfirm && (
        <Modal open onClose={() => setShowCancelConfirm(false)} size="sm">
          <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
                <CalendarX size={24} className="text-danger" />
              </div>
              <h3 className="text-base font-bold text-foreground">Batalkan Meeting?</h3>
              <p className="mt-1.5 text-xs text-muted">
                Yakin ingin membatalkan <strong>"{detailEvent.title}"</strong>?
                {detailEvent.googleEventId && (
                  <span className="mt-1 block text-[10px] text-orange-600">
                    Google Calendar akan diupdate dan email pembatalan dikirim ke semua attendees.
                  </span>
                )}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  disabled={actionLoading}
                  className="btn-secondary flex-1 text-xs"
                >
                  Tidak
                </button>
                <button
                  onClick={handleCancelMeeting}
                  disabled={actionLoading}
                  className="btn-primary flex-1 text-xs bg-danger hover:bg-red-600 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> Membatalkan...</>
                  ) : (
                    <><Trash2 size={14} /> Ya, Batalkan</>
                  )}
                </button>
              </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Helper ───
function isToday(dateString: string): boolean {
  return dateString === dateStr(new Date());
}