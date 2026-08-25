"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Search, X, Calendar, Clock, MapPin, Camera, Video, MoreVertical,
  Pencil, Trash2, AlertCircle, Loader2, Clapperboard, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProductionDetailModal } from "@/components/production/production-detail-modal";

interface Production {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  status: string;
  shoot_date: string | null;
  shoot_location: string | null;
  crew: string[] | { name: string; role: string }[];
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

const emptyForm = {
  title: "",
  description: "",
  client_id: "",
  status: "scheduled",
  shoot_date: "",
  shoot_location: "",
  assigned_to: "",
  notes: "",
};

export default function ProductionPage() {
  const supabase = createClient();
  const [productions, setProductions] = useState<Production[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [detailProduction, setDetailProduction] = useState<Production | null>(null);

  // Crew & Deliverables state for modal
  const [modalCrew, setModalCrew] = useState<{ name: string; role: string }[]>([]);
  const [modalDeliverables, setModalDeliverables] = useState<string[]>([]);
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");
  const [newDeliverable, setNewDeliverable] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [{ data: prodData, error: err1 }, { data: clientData }, { data: teamData }] = await Promise.all([
        supabase.from("production_schedules").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("profiles").select("id, full_name").eq("is_active", true),
      ]);

      if (err1) throw err1;

      const clientMap = new Map((clientData || []).map((c: any) => [c.id, c.name]));
      const teamMap = new Map((teamData || []).map((t: any) => [t.id, t.full_name]));

      const enriched = (prodData || []).map((p: any) => ({
        ...p,
        client_name: p.client_id ? clientMap.get(p.client_id) : null,
        assignee_name: p.assigned_to ? teamMap.get(p.assigned_to) : null,
      }));

      setProductions(enriched);
      setClients((clientData as unknown as Client[]) || []);
      setTeam((teamData as unknown as TeamMember[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat data produksi: " + msg);
      toast.error("Gagal memuat data produksi");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return productions.filter((p) => {
      const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [productions, search, statusFilter]);

  const stats = useMemo(() => {
    const total = productions.length;
    const counts: Record<string, number> = {};
    for (const s of STATUSES) counts[s.value] = productions.filter((p) => p.status === s.value).length;
    const upcoming = productions.filter((p) => p.shoot_date && new Date(p.shoot_date) > new Date()).length;
    return { total, counts, upcoming };
  }, [productions]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setModalCrew([]);
    setModalDeliverables([]);
    setNewCrewName("");
    setNewCrewRole("");
    setNewDeliverable("");
    setShowModal(true);
  }

  function openEdit(p: Production) {
    setForm({
      title: p.title,
      description: p.description || "",
      client_id: p.client_id || "",
      status: p.status,
      shoot_date: p.shoot_date ? p.shoot_date.split("T")[0] : "",
      shoot_location: p.shoot_location || "",
      assigned_to: p.assigned_to || "",
      notes: p.notes || "",
    });
    // Normalize crew to { name, role } objects
    const normalizedCrew = (Array.isArray(p.crew) ? p.crew : []).map((c: any) => {
      if (typeof c === "string") return { name: c, role: "" };
      return { name: c?.name || "", role: c?.role || "" };
    });
    setModalCrew(normalizedCrew);
    setModalDeliverables(Array.isArray(p.deliverables) ? p.deliverables : []);
    setNewCrewName("");
    setNewCrewRole("");
    setNewDeliverable("");
    setEditingId(p.id);
    setShowModal(true);
  }

  function addModalCrew() {
    if (!newCrewName.trim()) return;
    setModalCrew([...modalCrew, { name: newCrewName.trim(), role: newCrewRole.trim() }]);
    setNewCrewName("");
    setNewCrewRole("");
  }

  function removeModalCrew(idx: number) {
    setModalCrew(modalCrew.filter((_, i) => i !== idx));
  }

  function addModalDeliverable() {
    if (!newDeliverable.trim()) return;
    setModalDeliverables([...modalDeliverables, newDeliverable.trim()]);
    setNewDeliverable("");
  }

  function removeModalDeliverable(idx: number) {
    setModalDeliverables(modalDeliverables.filter((_, i) => i !== idx));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast.error("Title wajib diisi"); return; }
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
        crew: modalCrew,
        deliverables: modalDeliverables,
        ...(editingId ? {} : { created_by: user?.id }),
      };

      if (editingId) {
        const { error: err } = await supabase.from("production_schedules").update(payload as never).eq("id", editingId);
        if (err) throw err;
        toast.success("Production diupdate!");
      } else {
        const { error: err } = await supabase.from("production_schedules").insert(payload as never);
        if (err) throw err;
        toast.success("Production dibuat!");
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error: err } = await supabase.from("production_schedules").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Production dihapus");
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      const { error: err } = await supabase.from("production_schedules").update({ status: newStatus } as never).eq("id", id);
      if (err) throw err;
      toast.success("Status updated");
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal: " + msg);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Production</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-4">Coba Lagi</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production"
        subtitle="Jadwal dan tracking produksi video/foto"
        actions={<button onClick={openCreate} className="btn-primary"><Plus size={16} /> New Production</button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <Clapperboard className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted">Total Productions</p>
        </div>
        <div className="card p-4">
          <Calendar className="mb-2 text-primary" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.upcoming}</p>
          <p className="text-xs text-muted">Upcoming Shoots</p>
        </div>
        <div className="card p-4">
          <Video className="mb-2 text-amber-500" size={18} />
          <p className="text-2xl font-bold text-foreground">{(stats.counts.editing || 0) + (stats.counts.rendering || 0)}</p>
          <p className="text-xs text-muted">In Post-Production</p>
        </div>
        <div className="card p-4">
          <Settings className="mb-2 text-success" size={18} />
          <p className="text-2xl font-bold text-foreground">{stats.counts.delivered || 0}</p>
          <p className="text-xs text-muted">Delivered</p>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setStatusFilter("all")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
            statusFilter === "all" ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          All ({stats.total})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              statusFilter === s.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:text-foreground"
            )}
          >
            {s.label} ({stats.counts[s.value] || 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input type="text" placeholder="Cari produksi..." value={search} onChange={(e) => setSearch(e.target.value)} className="input py-1.5 pl-8 text-xs" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"><X size={14} /></button>}
      </div>

      {/* Productions List */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Clapperboard className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada production schedule</p>
          <button onClick={openCreate} className="btn-primary mt-4"><Plus size={16} /> Buat Production Pertama</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const status = STATUSES.find((s) => s.value === p.status);
            const Icon = status?.icon || Clapperboard;
            const isUpcoming = p.shoot_date && new Date(p.shoot_date) > new Date();
            return (
            <div key={p.id} className="card cursor-pointer p-4 transition-shadow hover:ring-1 hover:ring-primary/20" onClick={() => setDetailProduction(p)}>
                 <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Icon className="text-muted" size={16} />
                      <h3 className="font-semibold text-foreground">{p.title}</h3>
                      <select
                        value={p.status}
                        onChange={(e) => { e.stopPropagation(); handleStatusChange(p.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn("cursor-pointer border-0 text-xs font-medium outline-none", status?.color)}
                      >
                        {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      {isUpcoming && <span className="badge bg-primary/10 text-primary">📅 Upcoming</span>}
                    </div>
                    {p.description && <p className="text-sm text-muted">{p.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted">
                      {p.client_name && <span>🏢 {p.client_name}</span>}
                      {p.shoot_date && (
                        <span className={isUpcoming ? "font-bold text-primary" : ""}>
                          <Calendar size={9} className="inline" /> {new Date(p.shoot_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      {p.shoot_location && <span><MapPin size={9} className="inline" /> {p.shoot_location}</span>}
                      {p.assignee_name && <span>👤 {p.assignee_name}</span>}
                    </div>
                    {Array.isArray(p.deliverables) && p.deliverables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.deliverables.map((d, i) => <span key={i} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">{d}</span>)}
                      </div>
                    )}
                    {Array.isArray(p.crew) && p.crew.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.crew.map((c, i) => {
                          const name = typeof c === "string" ? c : c?.name;
                          const role = typeof c === "string" ? "" : c?.role;
                          return name ? (
                            <span key={i} className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted">
                              👥 {name}{role ? ` (${role})` : ""}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                    {p.notes && <div className="mt-2 rounded-md bg-background p-2 text-xs text-muted">{p.notes}</div>}
                  </div>
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)} className="rounded p-1.5 text-muted hover:bg-background hover:text-primary">
                      <MoreVertical size={14} />
                    </button>
                    {menuOpenId === p.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                          <button onClick={() => { setDetailProduction(p); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-primary/5">
                            <Pencil size={12} /> Detail / Edit
                          </button>
                          <button onClick={() => { setDeleteTarget({ id: p.id, title: p.title }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-danger/5">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold text-foreground">{editingId ? "Edit Production" : "New Production"}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Title <span className="text-danger">*</span></label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input py-2 text-sm" placeholder="Shoot Video Iklan Ramadhan" />
                </div>
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
                  <label className="mb-1 block text-xs font-medium text-muted">Shoot Date</label>
                  <input type="datetime-local" value={form.shoot_date ? form.shoot_date.replace(" ", "T").slice(0, 16) : ""} onChange={(e) => setForm({ ...form, shoot_date: e.target.value })} className="input py-2 text-sm" />
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
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input py-2 text-sm" placeholder="Detail produksi..." />
                </div>

                {/* Crew Editor */}
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-muted">Crew Members</label>
                  <div className="space-y-1.5">
                    {modalCrew.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={c.name} readOnly className="input flex-1 py-1.5 text-xs" />
                        {c.role && <span className="text-xs text-muted">{c.role}</span>}
                        <button type="button" onClick={() => removeModalCrew(i)} className="rounded p-1 text-danger hover:bg-danger/10"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={newCrewName}
                      onChange={(e) => setNewCrewName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModalCrew())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Nama crew..."
                    />
                    <input
                      value={newCrewRole}
                      onChange={(e) => setNewCrewRole(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModalCrew())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Role (Videographer, Editor, dll)..."
                    />
                    <button type="button" onClick={addModalCrew} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap"><Plus size={12} /> Add</button>
                  </div>
                </div>

                {/* Deliverables Editor */}
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-muted">Deliverables</label>
                  <div className="flex flex-wrap gap-1.5">
                    {modalDeliverables.map((d, i) => (
                      <span key={i} className="flex items-center gap-1 rounded bg-background px-2 py-1 text-xs">
                        {d}
                        <button type="button" onClick={() => removeModalDeliverable(i)} className="text-danger hover:text-danger/80"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={newDeliverable}
                      onChange={(e) => setNewDeliverable(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addModalDeliverable())}
                      className="input flex-1 py-1.5 text-xs"
                      placeholder="Contoh: 3 Video Reels 30s, 10 Foto Produk..."
                    />
                    <button type="button" onClick={addModalDeliverable} className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs whitespace-nowrap"><Plus size={12} /> Add</button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input py-2 text-sm" placeholder="Catatan tambahan..." />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:bg-background hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-1.5 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailProduction && (
        <ProductionDetailModal
          production={detailProduction}
          onClose={() => setDetailProduction(null)}
          onUpdated={() => { loadData(); }}
          onDeleted={() => { setDetailProduction(null); loadData(); }}
          clients={clients}
          team={team}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Production?"
        message={`Yakin ingin menghapus "${deleteTarget?.title}"?`}
        confirmText="Hapus"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}