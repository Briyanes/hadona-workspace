"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import {
  Upload,
  Plus,
  ExternalLink,
  Trash2,
  Search,
  Pencil,
  Copy,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { cn, formatDate, extractError } from "@/lib/utils";

interface UploadLog {
  id: string;
  client_id: string | null;
  upload_date: string;
  division: string | null;
  brief_no: string | null;
  caption: string | null;
  content_link: string | null;
  status: string;
  notes: string | null;
  client?: { name: string };
}

interface Client {
  id: string;
  name: string;
}

const statusColors: Record<string, string> = {
  todo: "bg-surface text-muted",
  "in-progress": "bg-accent/20 text-accent",
  uploaded: "bg-primary/20 text-primary",
  done: "bg-success/20 text-success",
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  uploaded: "Uploaded",
  done: "Done",
};

const EMPTY_FORM = {
  client_id: "",
  upload_date: new Date().toISOString().split("T")[0],
  division: "SMM",
  brief_no: "",
  caption: "",
  content_link: "",
  status: "todo",
  notes: "",
};

export default function UploadTracker() {
  const supabase = createClient();
  const [uploads, setUploads] = useState<UploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadUploads();
    loadClients();
  }, [supabase]);

  async function loadUploads() {
    try {
      const { data, error } = await supabase
        .from("content_uploads")
        .select("*, client:clients(name)")
        .order("upload_date", { ascending: false });
      if (error) throw error;
      setUploads((data as unknown as UploadLog[]) || []);
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal memuat upload logs: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(log: UploadLog) {
    setEditingId(log.id);
    setForm({
      client_id: log.client_id || "",
      upload_date: log.upload_date,
      division: log.division || "SMM",
      brief_no: log.brief_no || "",
      caption: log.caption || "",
      content_link: log.content_link || "",
      status: log.status,
      notes: log.notes || "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      client_id: form.client_id || null,
      upload_date: form.upload_date,
      division: form.division,
      brief_no: form.brief_no || null,
      caption: form.caption || null,
      content_link: form.content_link || null,
      status: form.status,
      notes: form.notes || null,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("content_uploads").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("Upload log diupdate!");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("content_uploads").insert({
          ...payload,
          created_by: userData.user?.id,
        } as never);
        if (error) throw error;
        toast.success("Upload log dibuat!");
      }
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      setShowModal(false);
      loadUploads();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("content_uploads").update({ status } as never).eq("id", id);
    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      toast.success("Status: " + statusLabels[status]);
      loadUploads();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus log ini?")) return;
    const { error } = await supabase.from("content_uploads").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
    } else {
      toast.success("Log dihapus");
      loadUploads();
    }
  }

  function copyCaption(text: string | null) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Caption disalin!");
  }

  const filtered = uploads.filter((u) => {
    const matchSearch =
      !search ||
      u.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.brief_no?.toLowerCase().includes(search.toLowerCase()) ||
      u.caption?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    const matchClient = clientFilter === "all" || u.client_id === clientFilter;
    return matchSearch && matchStatus && matchClient;
  });

  const totalUploads = uploads.length;
  const todoCount = uploads.filter((u) => u.status === "todo").length;
  const inProgressCount = uploads.filter((u) => u.status === "in-progress").length;
  const doneCount = uploads.filter((u) => u.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Upload className="text-primary" size={16} />
            <p className="text-xs uppercase text-muted">Total</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{totalUploads}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Clock className="text-accent" size={16} />
            <p className="text-xs uppercase text-muted">In Progress</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{inProgressCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <LinkIcon className="text-primary" size={16} />
            <p className="text-xs uppercase text-muted">To Do</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{todoCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-success" size={16} />
            <p className="text-xs uppercase text-muted">Done</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{doneCount}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Search + Filter */}
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder="Cari client, brief, caption..."
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
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
            <option value="all">Semua Status</option>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus size={16} /> Log Upload
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Upload className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada upload log</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Buat Log Pertama
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((u) => (
            <div key={u.id} className="card group">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* Left content */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{u.client?.name || "No Client"}</h3>
                    <span className={cn("badge", statusColors[u.status] || statusColors.todo)}>
                      {statusLabels[u.status] || u.status}
                    </span>
                    {u.brief_no && (
                      <span className="badge bg-background text-muted">{u.brief_no}</span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Calendar size={12} /> {formatDate(u.upload_date)}
                    {u.division && <span className="ml-2">· {u.division}</span>}
                  </p>
                  {u.caption && (
                    <div className="mt-2 rounded-md border border-border bg-background p-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm text-foreground">{u.caption}</p>
                        <button
                          onClick={() => copyCaption(u.caption)}
                          className="shrink-0 rounded p-1 text-muted hover:bg-surface hover:text-primary"
                          title="Copy caption"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  {u.notes && <p className="text-xs text-muted">{u.notes}</p>}
                </div>

                {/* Right actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {u.content_link && (
                    <a
                      href={u.content_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Content Link"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <select
                    value={u.status}
                    onChange={(e) => updateStatus(u.id, e.target.value)}
                    className="rounded-md border-0 bg-background px-2 py-1 text-xs font-medium"
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                  <button
                    onClick={() => openEdit(u)}
                    className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(u.id)}
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

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit Upload Log" : "Upload Log Baru"}
        scrollable
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn-secondary"
            >
              Batal
            </button>
            <button type="submit" form="upload-form" disabled={saving} className="btn-primary">
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Menyimpan...
                </>
              ) : editingId ? (
                "Update Log"
              ) : (
                "Simpan Log"
              )}
            </button>
          </>
        }
      >
        <form id="upload-form" onSubmit={handleSave} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client</label>
                    <select
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                      className="input"
                    >
                      <option value="">— Pilih Client —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tanggal Upload</label>
                    <input
                      type="date"
                      required
                      value={form.upload_date}
                      onChange={(e) => setForm({ ...form, upload_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Divisi</label>
                    <select
                      value={form.division}
                      onChange={(e) => setForm({ ...form, division: e.target.value })}
                      className="input"
                    >
                      <option value="SMM">SMM</option>
                      <option value="Editor">Editor</option>
                      <option value="Creative Director">Creative Director</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="input"
                    >
                      <option value="todo">To Do</option>
                      <option value="in-progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Brief No</label>
                  <input
                    type="text"
                    value={form.brief_no}
                    onChange={(e) => setForm({ ...form, brief_no: e.target.value })}
                    placeholder="Contoh: Brief9, Brief10..."
                    className="input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Caption</label>
                  <textarea
                    rows={4}
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Caption untuk konten + hashtag..."
                    className="input resize-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Content Link</label>
                  <input
                    type="url"
                    value={form.content_link}
                    onChange={(e) => setForm({ ...form, content_link: e.target.value })}
                    placeholder="https://instagram.com/... atau Google Drive link"
                    className="input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Catatan</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Catatan tambahan..."
                    className="input resize-none"
                  />
                </div>
        </form>
      </Modal>
    </div>
  );
}
