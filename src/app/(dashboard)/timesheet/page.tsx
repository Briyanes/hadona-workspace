"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  Plus,
  X,
  Pencil,
  Trash2,
  Search,
  Loader2,
  DollarSign,
  Calendar,
} from "lucide-react";
import { cn, formatDate, formatIDR, extractError } from "@/lib/utils";
import { useTimer, formatTimerTime } from "@/hooks/use-timer";
import { Play, Square, Timer as TimerIcon } from "lucide-react";

interface Timesheet {
  id: string;
  user_id: string;
  client_id: string | null;
  date: string;
  hours: number;
  activity_type: string | null;
  description: string | null;
  billable: boolean;
  hourly_rate: number | null;
  created_at: string;
  client?: { name: string };
  user?: { full_name: string | null };
}

interface Client {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
}

const ACTIVITY_TYPES = [
  "meeting",
  "design",
  "development",
  "strategy",
  "ads_management",
  "reporting",
  "research",
  "general",
];

const emptyForm = {
  client_id: "",
  date: new Date().toISOString().split("T")[0],
  hours: "",
  activity_type: "general",
  description: "",
  billable: true,
  hourly_rate: "",
  user_id: "",
};

export default function TimesheetPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [currentUser, setCurrentUser] = useState<string>("");

  // Live Timer
  const timer = useTimer();
  const [timerDesc, setTimerDesc] = useState("");
  const [timerClient, setTimerClient] = useState("");
  const [timerActivity, setTimerActivity] = useState("general");

  useEffect(() => {
    initialLoad();
  }, []);

  async function handleStopTimer() {
    const totalSeconds = timer.stop();
    const hours = parseFloat((totalSeconds / 3600).toFixed(2));

    if (hours < 0.01) {
      toast.info("Timer terlalu singkat (< 1 menit), tidak disimpan.");
      timer.reset();
      return;
    }

    try {
      const payload = {
        user_id: currentUser,
        client_id: timerClient || null,
        date: new Date().toISOString().split("T")[0],
        hours,
        activity_type: timerActivity,
        description: timerDesc.trim() || "Tracked via timer",
        billable: !!timerClient,
        hourly_rate: null,
      };
      const { error } = await supabase.from("timesheets").insert(payload as never);
      if (error) throw error;

      toast.success(`Timer stopped! ${hours}h logged.`);
      timer.reset();
      setTimerDesc("");
      setTimerClient("");
      setTimerActivity("general");
      loadEntries();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan timer: " + msg);
      // Re-enable timer so user can retry
      timer.start({ description: timerDesc, clientId: timerClient, activityType: timerActivity });
    }
  }

  async function initialLoad() {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      setCurrentUser(userData.user.id);
      setForm((prev) => ({ ...prev, user_id: userData.user.id }));
    }
    loadEntries();
    loadClients();
    loadTeam();
  }

  async function loadEntries() {
    try {
      const { data, error } = await supabase
        .from("timesheets")
        .select("*, client:clients(name), user:profiles!user_id(full_name)")
        .order("date", { ascending: false });
      if (error) throw error;
      setEntries((data as unknown as Timesheet[]) || []);
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal memuat timesheet: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function loadTeam() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");
    setTeam((data as unknown as TeamMember[]) || []);
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      user_id: currentUser,
      date: new Date().toISOString().split("T")[0],
    });
    setShowModal(true);
  }

  function openEdit(entry: Timesheet) {
    setEditingId(entry.id);
    setForm({
      user_id: entry.user_id,
      client_id: entry.client_id || "",
      date: entry.date,
      hours: entry.hours.toString(),
      activity_type: entry.activity_type || "general",
      description: entry.description || "",
      billable: entry.billable,
      hourly_rate: entry.hourly_rate?.toString() || "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.user_id || !form.date || !form.hours) {
      toast.error("User, tanggal, dan jam wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: form.user_id,
        client_id: form.client_id || null,
        date: form.date,
        hours: parseFloat(form.hours),
        activity_type: form.activity_type,
        description: form.description.trim() || null,
        billable: form.billable,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("timesheets")
          .update(payload as never)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Entry diupdate!");
      } else {
        const { error } = await supabase.from("timesheets").insert(payload as never);
        if (error) throw error;
        toast.success("Entry ditambahkan!");
      }

      setShowModal(false);
      loadEntries();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus entry ini?")) return;
    try {
      const { error } = await supabase.from("timesheets").delete().eq("id", id);
      if (error) throw error;
      toast.success("Entry dihapus");
      loadEntries();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  const filtered = entries.filter((e) => {
    const matchSearch =
      !search ||
      e.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.user?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchClient = clientFilter === "all" || e.client_id === clientFilter;
    const matchDate = !dateFilter || e.date === dateFilter;
    return matchSearch && matchClient && matchDate;
  });

  // Stats
  const totalHours = filtered.reduce((sum, e) => sum + e.hours, 0);
  const billableHours = filtered
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.hours, 0);
  const totalRevenue = filtered
    .filter((e) => e.billable && e.hourly_rate)
    .reduce((sum, e) => sum + e.hours * (e.hourly_rate || 0), 0);
  const entryCount = filtered.length;

  // Group by date
  const grouped = filtered.reduce((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {} as Record<string, Timesheet[]>);

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const statCards = [
    {
      label: "Total Hours",
      value: totalHours.toFixed(1) + "h",
      sub: `${entryCount} entries`,
      icon: Clock,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Billable Hours",
      value: billableHours.toFixed(1) + "h",
      sub: `${((billableHours / (totalHours || 1)) * 100).toFixed(0)}% utilization`,
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Est. Revenue",
      value: formatIDR(totalRevenue),
      sub: "from billable",
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Entries",
      value: entryCount.toString(),
      sub: "total logs",
      icon: Calendar,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Timesheet</h1>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Timesheet</h1>
          <p className="text-sm text-muted">Track billable hours & aktivitas tim</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Log Time
        </button>
      </div>

      {/* Live Timer Widget */}
      <div className={cn(
        "rounded-lg border p-4 transition-colors",
        timer.isRunning
          ? "border-success/30 bg-success/5"
          : "border-border bg-surface"
      )}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Timer info */}
          <div className="flex items-center gap-4">
            <div className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
              timer.isRunning
                ? "bg-success/10 animate-pulse"
                : "bg-primary/10"
            )}>
              <TimerIcon
                size={24}
                className={timer.isRunning ? "text-success" : "text-primary"}
              />
            </div>
            <div>
              <div className="font-mono text-3xl font-bold tabular-nums text-gray-900">
                {formatTimerTime(timer.elapsed)}
              </div>
              <div className="text-xs text-muted">
                {timer.isRunning
                  ? "Timer berjalan..."
                  : "Timer idle — klik Start untuk mulai"}
              </div>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!timer.isRunning ? (
              <>
                <select
                  value={timerClient}
                  onChange={(e) => setTimerClient(e.target.value)}
                  className="input w-auto min-w-[140px] text-xs"
                >
                  <option value="">— Internal —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={timerActivity}
                  onChange={(e) => setTimerActivity(e.target.value)}
                  className="input w-auto min-w-[120px] text-xs"
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Deskripsi..."
                  value={timerDesc}
                  onChange={(e) => setTimerDesc(e.target.value)}
                  className="input w-auto min-w-[150px] text-xs"
                />
                <button
                  onClick={() =>
                    timer.start({
                      description: timerDesc,
                      clientId: timerClient,
                      activityType: timerActivity,
                    })
                  }
                  className="btn-primary text-xs"
                >
                  <Play size={14} /> Start
                </button>
              </>
            ) : (
              <>
                <span className="badge bg-success/10 text-success">
                  {ACTIVITY_TYPES.find((t) => t === timerActivity)?.replace(/_/g, " ") || "general"}
                </span>
                <button
                  onClick={handleStopTimer}
                  className="btn text-xs"
                  style={{ background: "#dc2626", color: "white" }}
                >
                  <Square size={14} /> Stop & Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">{card.value}</p>
              <p className="mt-0.5 text-[10px] text-muted">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari nama, client, atau deskripsi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="input w-auto"
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Entries grouped by date */}
      {sortedDates.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Clock className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada timesheet entry</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Log Time Pertama
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const dayEntries = grouped[date];
            const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
            return (
              <div key={date}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {formatDate(date, { weekday: "long" })}
                  </h3>
                  <span className="badge bg-surface text-muted">
                    {dayHours.toFixed(1)}h total
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  {dayEntries.map((e, idx) => (
                    <div
                      key={e.id}
                      className={cn(
                        "group flex items-center gap-4 bg-surface p-3 hover:bg-surface/50",
                        idx !== dayEntries.length - 1 && "border-b border-border"
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                        {e.hours}h
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {e.user?.full_name || "Unknown"}
                          </span>
                          {e.client && (
                            <span className="badge bg-background text-muted">{e.client.name}</span>
                          )}
                          {e.billable ? (
                            <span className="badge bg-success/10 text-success">Billable</span>
                          ) : (
                            <span className="badge bg-surface text-muted">Non-billable</span>
                          )}
                        </div>
                        {e.description && (
                          <p className="mt-0.5 truncate text-xs text-muted">{e.description}</p>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                          <span className="capitalize">{e.activity_type?.replace(/_/g, " ")}</span>
                          {e.hourly_rate && <span>· {formatIDR(e.hourly_rate)}/h</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(e)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                          title="Hapus"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal — Sticky Header/Footer + Scroll */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Entry" : "Log Time Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
              <div className="space-y-4 overflow-y-auto px-6 py-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Anggota Tim</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Pilih Anggota —</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || "Unknown"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Tanggal</label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Jam (hours)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    required
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder="8"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Client</label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Internal / No Client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Tipe Aktivitas</label>
                  <select
                    value={form.activity_type}
                    onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
                    className="input"
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
                    Hourly Rate (Rp)
                  </label>
                  <input
                    type="number"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                    placeholder="150000"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Deskripsi</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Apa yang dikerjakan..."
                  className="input resize-none"
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={(e) => setForm({ ...form, billable: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm text-gray-900">Billable (dikenakan biaya ke client)</span>
              </label>

              </div>

              {/* Sticky Footer */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : editingId ? (
                    "Update Entry"
                  ) : (
                    "Simpan Entry"
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