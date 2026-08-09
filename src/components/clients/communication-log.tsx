"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MessageCircle,
  Users,
  MapPin,
  MoreHorizontal,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn, formatDate, extractError } from "@/lib/utils";

interface Communication {
  id: string;
  client_id: string;
  user_id: string;
  type: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  follow_up_date: string | null;
  created_at: string;
  user?: { full_name: string | null; avatar_url: string | null };
}

interface CommunicationLogProps {
  clientId: string;
}

const COMM_TYPES = [
  { value: "call", label: "Call", icon: Phone, color: "text-blue-500" },
  { value: "email", label: "Email", icon: Mail, color: "text-purple-500" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-green-500" },
  { value: "meeting", label: "Meeting", icon: Users, color: "text-orange-500" },
  { value: "visit", label: "Visit", icon: MapPin, color: "text-red-500" },
  { value: "other", label: "Other", icon: MoreHorizontal, color: "text-muted" },
];

const OUTCOMES = [
  { value: "positive", label: "Positive", icon: TrendingUp, color: "text-success" },
  { value: "neutral", label: "Neutral", icon: Minus, color: "text-muted" },
  { value: "negative", label: "Negative", icon: TrendingDown, color: "text-danger" },
  { value: "follow_up", label: "Need Follow-up", icon: CalendarClock, color: "text-warning" },
  { value: "closed_won", label: "Closed Won", icon: CheckCircle, color: "text-success" },
  { value: "closed_lost", label: "Closed Lost", icon: XCircle, color: "text-danger" },
];

function getCommType(type: string) {
  return COMM_TYPES.find((t) => t.value === type) || COMM_TYPES[5];
}

function getOutcome(outcome: string | null) {
  if (!outcome) return null;
  return OUTCOMES.find((o) => o.value === outcome) || null;
}

export function CommunicationLog({ clientId }: CommunicationLogProps) {
  const supabase = createClient();
  const [logs, setLogs] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    type: "call",
    subject: "",
    notes: "",
    outcome: "",
    follow_up_date: "",
  };

  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    loadLogs();
  }, [clientId]);

  async function loadLogs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("client_communications")
        .select(
          `
          *,
          user:profiles(full_name, avatar_url)
        `
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .returns<Communication[]>();

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      toast.error("Gagal memuat communication log: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(log: Communication) {
    setForm({
      type: log.type,
      subject: log.subject,
      notes: log.notes || "",
      outcome: log.outcome || "",
      follow_up_date: log.follow_up_date || "",
    });
    setEditingId(log.id);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.subject.trim()) {
      toast.error("Subject wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = {
        client_id: clientId,
        user_id: user.id,
        type: form.type,
        subject: form.subject.trim(),
        notes: form.notes.trim() || null,
        outcome: form.outcome || null,
        follow_up_date: form.follow_up_date || null,
      };

      // Cast to any until supabase types are regenerated for the new table
      const table = supabase.from("client_communications") as any;

      if (editingId) {
        const { error } = await table
          .update({
            type: payload.type,
            subject: payload.subject,
            notes: payload.notes,
            outcome: payload.outcome,
            follow_up_date: payload.follow_up_date,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Communication log diperbarui");
      } else {
        const { error } = await table.insert(payload);
        if (error) throw error;
        toast.success("Communication log ditambahkan");
      }

      setShowModal(false);
      loadLogs();
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus log ini?")) return;
    try {
      const { error } = await (supabase.from("client_communications") as any).delete().eq("id", id);
      if (error) throw error;
      toast.success("Log dihapus");
      loadLogs();
    } catch (err) {
      toast.error("Gagal menghapus: " + extractError(err));
    }
  }

  // Stats
  const followUpCount = logs.filter((l) => l.outcome === "follow_up" || l.follow_up_date).length;
  const positiveCount = logs.filter(
    (l) => l.outcome === "positive" || l.outcome === "closed_won"
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{logs.length}</p>
          <p className="text-xs text-muted">Total Interaksi</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-success">{positiveCount}</p>
          <p className="text-xs text-muted">Positive</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-warning">{followUpCount}</p>
          <p className="text-xs text-muted">Follow-up</p>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> Log Interaksi
        </button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-muted" size={24} />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted">Belum ada interaksi yang tercatat.</p>
          <p className="mt-1 text-xs text-muted">Klik "Log Interaksi" untuk mencatat call, email, meeting, dll.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const TypeIcon = getCommType(log.type).icon;
            const outcome = getOutcome(log.outcome);

            return (
              <div key={log.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className={cn("mt-0.5 shrink-0", getCommType(log.type).color)}>
                    <TypeIcon size={18} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-gray-900">{log.subject}</h4>
                        <p className="mt-0.5 text-xs text-muted">
                          {getCommType(log.type).label} • {formatDate(log.created_at, { hour: "2-digit", minute: "2-digit" })}
                          {log.user?.full_name && ` • ${log.user.full_name}`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => openEdit(log)}
                          className="rounded p-1 text-muted hover:bg-surface hover:text-primary"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="rounded p-1 text-muted hover:bg-surface hover:text-danger"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    {log.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{log.notes}</p>
                    )}

                    {/* Outcome + Follow-up badges */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {outcome && (
                        <span className={cn("badge flex items-center gap-1", outcome.color)}>
                          <outcome.icon size={12} /> {outcome.label}
                        </span>
                      )}
                      {log.follow_up_date && (
                        <span className="badge flex items-center gap-1 border-warning text-warning">
                          <CalendarClock size={12} /> Follow-up: {formatDate(log.follow_up_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-base font-bold">
                {editingId ? "Edit Interaksi" : "Log Interaksi Baru"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-gray-900">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5">
              {/* Type selector */}
              <div>
                <label className="mb-2 block text-sm font-medium">Tipe Interaksi</label>
                <div className="grid grid-cols-3 gap-2">
                  {COMM_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-medium transition",
                        form.type === t.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted hover:border-primary/30"
                      )}
                    >
                      <t.icon size={16} className={form.type === t.value ? "" : t.color} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="mb-1 block text-sm font-medium">Subject *</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="cth: Discuss Q4 campaign strategy"
                  className="input"
                  autoFocus
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Detail pembicaraan, action items, dll..."
                  rows={4}
                  className="input resize-none"
                />
              </div>

              {/* Outcome */}
              <div>
                <label className="mb-2 block text-sm font-medium">Outcome</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setForm({ ...form, outcome: "" })}
                    className={cn(
                      "rounded-lg border p-2 text-xs",
                      !form.outcome ? "border-primary bg-primary/5 text-primary" : "border-border text-muted"
                    )}
                  >
                    No outcome
                  </button>
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setForm({ ...form, outcome: o.value })}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-lg border p-2 text-xs",
                        form.outcome === o.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted"
                      )}
                    >
                      <o.icon size={12} className={form.outcome === o.value ? "" : o.color} /> {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Follow-up date */}
              <div>
                <label className="mb-1 block text-sm font-medium">Follow-up Date</label>
                <input
                  type="date"
                  value={form.follow_up_date}
                  onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
                  className="input"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary text-sm">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : editingId ? (
                  "Update"
                ) : (
                  "Simpan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}