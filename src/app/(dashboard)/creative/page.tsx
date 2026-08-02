"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, Plus, X, ExternalLink, Trash2, MessageSquare, Search, Pencil, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { formatDate, cn, extractError } from "@/lib/utils";

interface CreativeRequest {
  id: string;
  client_id: string | null;
  request_date: string;
  objective_campaign: string | null;
  funnel: string | null;
  format: string | null;
  angle: string | null;
  content_url: string | null;
  caption: string | null;
  prefilled_message: string | null;
  status: string;
  created_at: string;
  due_date: string | null;
  assigned_to: string | null;
  client?: { name: string };
  creator?: { full_name: string | null };
  assignee?: { full_name: string | null };
}

interface Client {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
}

const statusColors: Record<string, string> = {
  requested: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  review: "bg-accent/20 text-accent",
  approved: "bg-success/20 text-success",
  rejected: "bg-danger/20 text-danger",
};

const statusLabels: Record<string, string> = {
  requested: "Requested",
  in_progress: "In Progress",
  review: "Review",
  approved: "Approved",
  rejected: "Rejected",
};

const funnelLabels: Record<string, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  conversion: "Conversion",
  retention: "Retention",
};

export default function CreativePage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<CreativeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    objective_campaign: "",
    funnel: "awareness",
    format: "",
    angle: "",
    content_url: "",
    caption: "",
    prefilled_message: "",
    assigned_to: "",
    due_date: "",
  });

  useEffect(() => {
    loadRequests();
    loadClients();
    loadTeam();
  }, [supabase]);

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from("creative_requests")
        .select("*, client:clients(name), creator:profiles!created_by(full_name), assignee:profiles!assigned_to(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data as unknown as CreativeRequest[]) || []);
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal memuat creative requests: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function loadTeam() {
    const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
    setTeam((data as unknown as TeamMember[]) || []);
  }

  function openEdit(r: CreativeRequest) {
    setEditingId(r.id);
    setForm({
      client_id: r.client_id || "",
      objective_campaign: r.objective_campaign || "",
      funnel: r.funnel || "awareness",
      format: r.format || "",
      angle: r.angle || "",
      content_url: r.content_url || "",
      caption: r.caption || "",
      prefilled_message: r.prefilled_message || "",
      assigned_to: r.assigned_to || "",
      due_date: r.due_date || "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const today = new Date().toISOString().split("T")[0];

    const payload = {
      client_id: form.client_id || null,
      request_date: today,
      objective_campaign: form.objective_campaign || null,
      funnel: form.funnel,
      format: form.format || null,
      angle: form.angle || null,
      content_url: form.content_url || null,
      caption: form.caption || null,
      prefilled_message: form.prefilled_message || null,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase
          .from("creative_requests")
          .update(payload as never)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Creative request diupdate!");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("creative_requests").insert({
          ...payload,
          created_by: userData.user?.id,
          status: "requested",
        } as never);
        if (error) throw error;
        toast.success("Creative request dibuat!");
      }

      setForm({
        client_id: "",
        objective_campaign: "",
        funnel: "awareness",
        format: "",
        angle: "",
        content_url: "",
        caption: "",
        prefilled_message: "",
        assigned_to: "",
        due_date: "",
      });
      setEditingId(null);
      setShowModal(false);
      loadRequests();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from("creative_requests")
      .update({ status } as never)
      .eq("id", id);
    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      toast.success("Status diubah ke " + statusLabels[status]);
      loadRequests();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus creative request ini?")) return;
    const { error } = await supabase.from("creative_requests").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
    } else {
      toast.success("Request dihapus");
      loadRequests();
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const filtered = requests.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const matchSearch =
      !search ||
      r.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.objective_campaign?.toLowerCase().includes(search.toLowerCase()) ||
      r.angle?.toLowerCase().includes(search.toLowerCase());
    const matchClient = clientFilter === "all" || r.client_id === clientFilter;
    return matchStatus && matchSearch && matchClient;
  });

  // ── Derived stats ──
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "requested" || r.status === "in_progress").length;
  const reviewCount = requests.filter((r) => r.status === "review").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const overdueCount = requests.filter((r) => r.due_date && r.due_date < todayStr && r.status !== "approved" && r.status !== "rejected").length;
  const statusCounts: Record<string, number> = {
    all: totalCount,
    requested: requests.filter((r) => r.status === "requested").length,
    in_progress: requests.filter((r) => r.status === "in_progress").length,
    review: requests.filter((r) => r.status === "review").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Creative Requests</h1>
          <p className="text-sm text-muted">Request kreatif untuk tim design/copy</p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm({
              client_id: "",
              objective_campaign: "",
              funnel: "awareness",
              format: "",
              angle: "",
              content_url: "",
              caption: "",
              prefilled_message: "",
              assigned_to: "",
              due_date: "",
            });
            setShowModal(true);
          }}
          className="btn-primary"
        >
          <Plus size={16} /> New Request
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Palette className="text-primary" size={16} />
            <p className="text-xs uppercase text-muted">Total</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Clock className="text-warning" size={16} />
            <p className="text-xs uppercase text-muted">In Progress</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{pendingCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-success" size={16} />
            <p className="text-xs uppercase text-muted">Approved</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{approvedCount}</p>
        </div>
        <div className={cn("card p-4", overdueCount > 0 && "ring-2 ring-danger/30")}>
          <div className="flex items-center gap-2">
            <AlertCircle className={overdueCount > 0 ? "text-danger" : "text-muted"} size={16} />
            <p className="text-xs uppercase text-muted">Overdue</p>
          </div>
          <p className={cn("mt-1 text-2xl font-bold", overdueCount > 0 ? "text-danger" : "text-gray-900")}>
            {overdueCount}
          </p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client, campaign, angle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", "requested", "in_progress", "review", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              statusFilter === s ? "bg-primary text-white" : "bg-surface text-muted hover:text-white"
            )}
          >
            {s === "all" ? "Semua" : statusLabels[s] || s}
            {statusCounts[s] > 0 && (
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  statusFilter === s ? "bg-white/20" : "bg-primary/10 text-primary"
                )}
              >
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Palette className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada creative request</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
            <Plus size={16} /> Buat Request
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="card">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{r.client?.name || "No Client"}</h3>
                  <p className="text-xs text-muted">{formatDate(r.request_date)}</p>
                </div>
                <select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className={cn("rounded-md border-0 px-2 py-1 text-xs font-medium", statusColors[r.status])}
                >
                  <option value="requested">Requested</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="space-y-1.5 text-sm">
                {r.objective_campaign && (
                  <p className="text-gray-900">
                    <span className="text-muted">Objective:</span> {r.objective_campaign}
                  </p>
                )}
                {r.funnel && (
                  <p>
                    <span className="text-muted">Funnel:</span>{" "}
                    <span className="badge bg-background text-muted">{funnelLabels[r.funnel] || r.funnel}</span>
                  </p>
                )}
                {r.format && (
                  <p className="text-gray-900">
                    <span className="text-muted">Format:</span> {r.format}
                  </p>
                )}
                {r.angle && (
                  <p className="text-gray-900">
                    <span className="text-muted">Angle:</span> {r.angle}
                  </p>
                )}
                {r.assignee?.full_name && (
                  <p className="text-gray-900">
                    <span className="text-muted">Assignee:</span> {r.assignee.full_name}
                  </p>
                )}
                {r.due_date && (
                  <p className={cn("text-gray-900", r.due_date < todayStr && "text-danger")}>
                    <span className="text-muted">Deadline:</span> {formatDate(r.due_date)}
                  </p>
                )}
              </div>

              {r.caption && (
                <div className="mt-3 rounded-md border border-border bg-background p-2">
                  <p className="text-xs text-muted">Caption:</p>
                  <p className="text-sm text-gray-900">{r.caption}</p>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="flex gap-2">
                  {r.content_url && (
                    <a
                      href={r.content_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Content URL"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {r.prefilled_message && (
                    <a
                      href={
                        r.prefilled_message.startsWith("http")
                          ? r.prefilled_message
                          : `https://wa.me/?text=${encodeURIComponent(r.prefilled_message)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-success"
                      title="Prefilled Message"
                    >
                      <MessageSquare size={14} />
                    </a>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(r)}
                    className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                    title="Hapus"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal — Sticky Header/Footer + Scroll */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Creative Request" : "Creative Request Baru"}
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Client</label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="input"
                >
                  <option value="">— Pilih Client (opsional) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Objective/Campaign</label>
                  <input
                    type="text"
                    value={form.objective_campaign}
                    onChange={(e) => setForm({ ...form, objective_campaign: e.target.value })}
                    placeholder="Contoh: Lebaran Sale 2025"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Funnel Stage</label>
                  <select
                    value={form.funnel}
                    onChange={(e) => setForm({ ...form, funnel: e.target.value })}
                    className="input"
                  >
                    <option value="awareness">Awareness</option>
                    <option value="consideration">Consideration</option>
                    <option value="conversion">Conversion</option>
                    <option value="retention">Retention</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Format</label>
                  <input
                    type="text"
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value })}
                    placeholder="Contoh: Video 15s, Carousel"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Angle</label>
                  <input
                    type="text"
                    value={form.angle}
                    onChange={(e) => setForm({ ...form, angle: e.target.value })}
                    placeholder="Contoh: Testimonial, FOMO"
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Content URL</label>
                <input
                  type="url"
                  value={form.content_url}
                  onChange={(e) => setForm({ ...form, content_url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Caption</label>
                <textarea
                  rows={2}
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  placeholder="Caption untuk konten..."
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Prefilled Message (WA/Link)</label>
                <textarea
                  rows={2}
                  value={form.prefilled_message}
                  onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })}
                  placeholder="Pesan WA atau link CTWA..."
                  className="input resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Assign To</label>
                  <select
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih Designer/Copywriter —</option>
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name || "Unknown"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Deadline</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

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
                  {saving ? "Menyimpan..." : editingId ? "Update Request" : "Kirim Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}