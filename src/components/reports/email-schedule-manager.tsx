"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Mail, Plus, Trash2, Loader2, Power, Clock, CheckCircle, XCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn, extractError } from "@/lib/utils";

interface Schedule {
  id: string;
  client_id: string;
  recipient_email: string;
  cc_emails: string[] | null;
  schedule_day: number;
  schedule_hour: number;
  timezone: string;
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
}

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function EmailScheduleManager({ clients }: { clients: Client[] }) {
  const supabase = createClient();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSched, setNewSched] = useState({
    clientId: "",
    recipientEmail: "",
    ccEmails: "",
    scheduleDay: 1,
    scheduleHour: 9,
  });

  const load = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports/email-schedule", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSchedules(data.schedules || []);
    } catch (err) {
      toast.error("Gagal load schedules: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newSched.clientId || !newSched.recipientEmail) {
      toast.error("Client & email wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const ccEmails = newSched.ccEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      const res = await fetch("/api/reports/email-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({
          action: "create",
          clientId: newSched.clientId,
          recipientEmail: newSched.recipientEmail,
          ccEmails: ccEmails.length > 0 ? ccEmails : null,
          scheduleDay: newSched.scheduleDay,
          scheduleHour: newSched.scheduleHour,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast.success("✅ Schedule email dibuat!");
      setNewSched({
        clientId: "",
        recipientEmail: "",
        ccEmails: "",
        scheduleDay: 1,
        scheduleHour: 9,
      });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports/email-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "toggle", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(data.is_active ? "Schedule diaktifkan" : "Schedule dinonaktifkan");
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus schedule email ini?")) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports/email-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Schedule dihapus");
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || "Unknown";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Mail size={16} /> Auto Email Scheduler
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            <Plus size={12} /> Add Schedule
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="mb-3 rounded-md bg-primary/5 p-2 text-[10px] text-muted">
        💡 Email otomatis dikirim setiap minggu sesuai jadwal. Pastikan report sudah dibuat sebelum jadwal dikirim.
      </div>

      {/* Create Form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-3 space-y-2 rounded-md border border-border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              required
              value={newSched.clientId}
              onChange={(e) => setNewSched({ ...newSched, clientId: e.target.value })}
              className="input text-xs"
            >
              <option value="">— Pilih Client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="email"
              required
              placeholder="email@client.com"
              value={newSched.recipientEmail}
              onChange={(e) => setNewSched({ ...newSched, recipientEmail: e.target.value })}
              className="input text-xs"
            />
          </div>
          <input
            type="text"
            placeholder="CC emails (pisahkan dengan koma)"
            value={newSched.ccEmails}
            onChange={(e) => setNewSched({ ...newSched, ccEmails: e.target.value })}
            className="input text-xs"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-0.5 block text-[10px] text-muted">Hari</label>
              <select
                value={newSched.scheduleDay}
                onChange={(e) => setNewSched({ ...newSched, scheduleDay: Number(e.target.value) })}
                className="input text-xs"
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] text-muted">Jam (WIB)</label>
              <select
                value={newSched.scheduleHour}
                onChange={(e) => setNewSched({ ...newSched, scheduleHour: Number(e.target.value) })}
                className="input text-xs"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : "Simpan"}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> Load schedules...
        </div>
      ) : schedules.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          Belum ada schedule. Klik "Add Schedule" untuk mulai.
        </p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center justify-between rounded-md border p-2 transition-colors",
                s.is_active ? "border-success/30 bg-success/5" : "border-border bg-background opacity-60"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-foreground">
                    {clientName(s.client_id)}
                  </span>
                  {s.is_active ? (
                    <CheckCircle size={10} className="text-success" />
                  ) : (
                    <XCircle size={10} className="text-muted" />
                  )}
                </div>
                <p className="truncate text-[10px] text-muted">{s.recipient_email}</p>
                {s.cc_emails && s.cc_emails.length > 0 && (
                  <p className="truncate text-[9px] text-muted">CC: {s.cc_emails.join(", ")}</p>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-[9px] text-muted">
                  <span className="flex items-center gap-0.5">
                    <Calendar size={8} /> {DAYS[s.schedule_day]}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock size={8} /> {s.schedule_hour}:00 WIB
                  </span>
                  {s.last_sent_at && (
                    <span className="text-success">Last: {new Date(s.last_sent_at).toLocaleDateString("id-ID")}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  onClick={() => handleToggle(s.id)}
                  className={cn(
                    "rounded p-1 transition-colors",
                    s.is_active ? "text-success hover:bg-success/10" : "text-muted hover:bg-background"
                  )}
                  title={s.is_active ? "Nonaktifkan" : "Aktifkan"}
                >
                  <Power size={12} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="rounded p-1 text-muted hover:bg-background hover:text-danger"
                  title="Hapus"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}