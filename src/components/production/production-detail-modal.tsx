"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  X, Pencil, Trash2, Calendar, MapPin, User, Plus, Loader2,
  Camera, Video, Clapperboard, Clock, Settings, AlertCircle,
  FileText, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CrewMember { name: string; role: string; }

interface Production {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  status: string;
  shoot_date: string | null;
  shoot_location: string | null;
  crew: CrewMember[] | string[];
  deliverables: string[];
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  client_name?: string | null;
  assignee_name?: string | null;
}

interface Client { id: string; name: string; }
interface TeamMember { id: string; full_name: string; }

const STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "badge bg-primary/20 text-primary", icon: Calendar },
  { value: "in_progress", label: "In Progress", color: "badge bg-cyan-100 text-cyan-700", icon: Clock },
  { value: "shooting", label: "Shooting", color: "badge bg-purple-100 text-purple-700", icon: Clapperboard },
  { value: "editing", label: "Editing", color: "badge bg-amber-100 text-amber-700", icon: Video },
  { value: "rendering", label: "Rendering", color: "badge bg-orange-100 text-orange-700", icon: Loader2 },
  { value: "review", label: "Review", color: "badge bg-blue-100 text-blue-700", icon: Clock },
  { value: "delivered", label: "Delivered", color: "badge bg-success/20 text-success", icon: Settings },
  { value: "cancelled", label: "Cancelled", color: "badge bg-danger/20 text-danger", icon: X },
] as const;

interface Props {
  production: Production | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  clients: Client[];
  team: TeamMember[];
}

export function ProductionDetailModal({ production, onClose, onUpdated, onDeleted, clients, team }: Props) {
  const supabase = createClient();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    client_id: "",
    status: "scheduled",
    shoot_date: "",
    shoot_location: "",
    assigned_to: "",
    notes: "",
  });
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [newDeliverable, setNewDeliverable] = useState("");

  useEffect(() => {
    if (production) {
      setMode("view");
      setForm({
        title: production.title || "",
        description: production.description || "",
        client_id: production.client_id || "",
        status: production.status || "scheduled",
        shoot_date: production.shoot_date ? production.shoot_date.split("T")[0] : "",
        shoot_location: production.shoot_location || "",
        assigned_to: production.assigned_to || "",
        notes: production.notes || "",
      });
      // Normalize crew to { name, role } objects
      const normalizedCrew = (production.crew || []).map((c: any) => {
        if (typeof c === "string") return { name: c, role: "" };
        return { name: c?.name || "", role: c?.role || "" };
      });
      setCrewList(normalizedCrew);
      setDeliverables(Array.isArray(production.deliverables) ? production.deliverables : []);
    }
  }, [production]);

  if (!production) return null;

  const statusInfo = STATUSES.find((s) => s.value === production.status);
  const StatusIcon = statusInfo?.icon || Clapperboard;
  const isUpcoming = production.shoot_date && new Date(production.shoot_date) > new Date();

  function addCrew() {
    if (!newCrewName.trim()) return;
    setCrewList([...crewList, { name: newCrewName.trim(), role: newCrewRole.trim() }]);
    setNewCrewName("");
    setNewCrewRole("");
  }

  function removeCrew(idx: number) {
    setCrewList(crewList.filter((_, i) => i !== idx));
  }

  function addDeliverable() {
    if (!newDeliverable.trim()) return;
    setDeliverables([...deliverables, newDeliverable.trim()]);
    setNewDeliverable("");
  }

  function removeDeliverable(idx: number) {
    setDeliverables(deliverables.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("Title wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        client_id: form.client_id || null,
        status: form.status,
        shoot_date: form.shoot_date || null,
        shoot_location: form.shoot_location.trim() || null,
        assigned_to: form.assigned_to || null,
        notes: form.notes.trim() || null,
        crew: crewList,
        deliverables: deliverables,
      };

      const { error: err } = await supabase
        .from("production_schedules")
        .update(payload as never)
        .eq("id", production!.id);
      if (err) throw err;

      toast.success("Production diupdate!");
      setMode("view");
      onUpdated();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const { error: err } = await supabase
        .from("production_schedules")
        .delete()
        .eq("id", production!.id);
      if (err) throw err;
      toast.success("Production dihapus");
      setShowDeleteConfirm(false);
      onDeleted();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal hapus: " + msg);
    }
  }

  const clientName = production.client_name || clients.find((c) => c.id === production.client_id)?.name;
  const assigneeName = production.assignee_name || team.find((t) => t.id === production.assigned_to)?.full_name;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-0 md:p-4">
        <div className="my-0 flex min-h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-xl md:my-4 md:min-h-0 md:max-h-[calc(100dvh-2rem)] md:rounded-lg">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:px-5 md:py-4">
            <div className="flex items-center gap-2">
              <StatusIcon className="text-primary" size={18} />
              <h2 className="text-base font-bold text-foreground md:text-lg">
                {mode === "edit" ? "Edit Production" : production.title}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              {mode === "view" && (
                <>
                  <button onClick={() => setMode("edit")} className="rounded p-1.5 text-muted hover:bg-background hover:text-primary" title="Edit">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)} className="rounded p-1.5 text-muted hover:bg-danger/10 hover:text-danger" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </>
              )}
              <button onClick={onClose} className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Content */}
          {mode === "view" ? (
            <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-5">
              {/* Status Badge */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("px-2 py-1 text-xs font-medium", statusInfo?.color)}>
                  {statusInfo?.label || production.status}
                </span>
                {isUpcoming && (
                  <span className="badge bg-primary/10 text-primary">📅 Upcoming Shoot</span>
                )}
              </div>

              {/* Description */}
              {production.description && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Description</label>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{production.description}</p>
                </div>
              )}

              {/* Info Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {clientName && (
                  <InfoItem icon={<Users size={14} />} label="Client" value={clientName} />
                )}
                {production.shoot_date && (
                  <InfoItem
                    icon={<Calendar size={14} />}
                    label="Shoot Date"
                    value={new Date(production.shoot_date).toLocaleDateString("id-ID", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                    highlight={!!isUpcoming}
                  />
                )}
                {production.shoot_location && (
                  <InfoItem icon={<MapPin size={14} />} label="Location" value={production.shoot_location} />
                )}
                {assigneeName && (
                  <InfoItem icon={<User size={14} />} label="Assigned To" value={assigneeName} />
                )}
              </div>

              {/* Crew */}
              {crewList.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Crew ({crewList.length})
                  </label>
                  <div className="space-y-1">
                    {crewList.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm">
                        <span className="font-medium text-foreground">{c.name}</span>
                        {c.role && <span className="text-xs text-muted">({c.role})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deliverables */}
              {deliverables.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Deliverables ({deliverables.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {deliverables.map((d, i) => (
                      <span key={i} className="flex items-center gap-1 rounded bg-background px-2 py-1 text-xs text-foreground">
                        <FileText size={10} /> {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {production.notes && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Notes</label>
                  <div className="rounded-md bg-background p-3 text-sm text-foreground whitespace-pre-wrap">{production.notes}</div>
                </div>
              )}
            </div>
          ) : (
            /* EDIT MODE */
            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Title <span className="text-danger">*</span></label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input py-2 text-sm"
                    placeholder="Shoot Video Iklan Ramadhan"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Client</label>
                    <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="input py-2 text-sm">
                      <option value="">— No Client —</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input py-2 text-sm">
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Shoot Date & Time</label>
                    <input
                      type="datetime-local"
                      value={form.shoot_date ? form.shoot_date.replace(" ", "T").slice(0, 16) : ""}
                      onChange={(e) => setForm({ ...form, shoot_date: e.target.value })}
                      className="input py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Shoot Location</label>
                    <input value={form.shoot_location} onChange={(e) => setForm({ ...form, shoot_location: e.target.value })} className="input py-2 text-sm" placeholder="Studio / Location" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-muted">Assigned To</label>
                    <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="input py-2 text-sm">
                      <option value="">— Unassigned —</option>
                      {team.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Description</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input py-2 text-sm" placeholder="Detail produksi..." />
                </div>

                {/* Crew Editor */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted">Crew Members</label>
                  <div className="space-y-1.5">
                    {crewList.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={c.name} readOnly className="input flex-1 py-1.5 text-xs" />
                        {c.role && <span className="text-xs text-muted">{c.role}</span>}
                        <button onClick={() => removeCrew(i)} className="rounded p-1 text-danger hover:bg-danger/10"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={newCrewName}
                      onChange={(e) => setNewCrewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCrew())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Nama crew..."
                    />
                    <input
                      value={newCrewRole}
                      onChange={(e) => setNewCrewRole(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCrew())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Role (Videographer, Editor, dll)..."
                    />
                    <button onClick={addCrew} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"><Plus size={12} /> Add</button>
                  </div>
                </div>

                {/* Deliverables Editor */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted">Deliverables</label>
                  <div className="flex flex-wrap gap-1.5">
                    {deliverables.map((d, i) => (
                      <span key={i} className="flex items-center gap-1 rounded bg-background px-2 py-1 text-xs">
                        {d}
                        <button onClick={() => removeDeliverable(i)} className="text-danger hover:text-danger/80"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={newDeliverable}
                      onChange={(e) => setNewDeliverable(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDeliverable())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Contoh: 3 Video Reels 30s, 10 Foto Produk..."
                    />
                    <button onClick={addDeliverable} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"><Plus size={12} /> Add</button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input py-2 text-sm" placeholder="Catatan tambahan..." />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
                <button onClick={() => setMode("view")} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:bg-background hover:text-foreground">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Hapus Production?"
        message={`Yakin ingin menghapus "${production.title}"? Aksi ini tidak bisa dibatalkan.`}
        confirmText="Hapus"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </>
  );
}

function InfoItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border p-3", highlight && "border-primary/30 bg-primary/5")}>
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {icon} {label}
      </div>
      <p className={cn("text-sm font-medium", highlight ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}