"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, Plus, X, ExternalLink, Trash2, MessageSquare } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface CreativeRequest {
  id: string;
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
        .select("*, client:clients(name), creator:profiles!creative_requests_created_by_fkey(full_name), assignee:profiles!creative_requests_assigned_to_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data as unknown as CreativeRequest[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const today = new Date().toISOString().split("T")[0];

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("creative_requests").insert({
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
      created_by: userData.user?.id,
      status: "requested",
    } as never);

    if (error) {
      toast.error("Gagal: " + error.message);
    } else {
      toast.success("Creative request dibuat!");
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
      setShowModal(false);
      loadRequests();
    }
    setSaving(false);
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
  const filtered = requests.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Creative Requests</h1>
          <p className="text-sm text-muted">Request kreatif untuk tim design/copy</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> New Request
        </button>
      </div>

      {/* Filter */}
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
                  <h3 className="font-semibold text-white">{r.client?.name || "No Client"}</h3>
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
                  <p className="text-white">
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
                  <p className="text-white">
                    <span className="text-muted">Format:</span> {r.format}
                  </p>
                )}
                {r.angle && (
                  <p className="text-white">
                    <span className="text-muted">Angle:</span> {r.angle}
                  </p>
                )}
                {r.assignee?.full_name && (
                  <p className="text-white">
                    <span className="text-muted">Assignee:</span> {r.assignee.full_name}
                  </p>
                )}
                {r.due_date && (
                  <p className={cn("text-white", r.due_date < todayStr && "text-danger")}>
                    <span className="text-muted">Deadline:</span> {formatDate(r.due_date)}
                  </p>
                )}
              </div>

              {r.caption && (
                <div className="mt-3 rounded-md border border-border bg-background p-2">
                  <p className="text-xs text-muted">Caption:</p>
                  <p className="text-sm text-white">{r.caption}</p>
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
                <button
                  onClick={() => handleDelete(r.id)}
                  className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Creative Request Baru</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Client</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Objective/Campaign</label>
                  <input
                    type="text"
                    value={form.objective_campaign}
                    onChange={(e) => setForm({ ...form, objective_campaign: e.target.value })}
                    placeholder="Contoh: Lebaran Sale 2025"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Funnel Stage</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Format</label>
                  <input
                    type="text"
                    value={form.format}
                    onChange={(e) => setForm({ ...form, format: e.target.value })}
                    placeholder="Contoh: Video 15s, Carousel"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white">Angle</label>
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
                <label className="mb-1.5 block text-sm font-medium text-white">Content URL</label>
                <input
                  type="url"
                  value={form.content_url}
                  onChange={(e) => setForm({ ...form, content_url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Caption</label>
                <textarea
                  rows={2}
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  placeholder="Caption untuk konten..."
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Prefilled Message (WA/Link)</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Assign To</label>
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
                  <label className="mb-1.5 block text-sm font-medium text-white">Deadline</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-white"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Menyimpan..." : "Kirim Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}