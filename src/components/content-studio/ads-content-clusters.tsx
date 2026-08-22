"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Boxes,
  Plus,
  X,
  Trash2,
  Search,
  Pencil,
  Loader2,
  LayoutGrid,
  List,
  Calendar,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";

interface ClusterItem {
  id: string;
  client_id: string | null;
  entry_date: string;
  format_type: string | null;
  theme: string | null;
  created_at?: string;
  client?: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

const FORMAT_OPTIONS = [
  "Single Image",
  "Carousel",
  "Video Pendek",
  "Video Panjang",
  "Reels/TikTok",
  "Story",
  "UGC",
  "Static Banner",
  "Lainnya",
];

const EMPTY_FORM = {
  client_id: "",
  entry_date: new Date().toISOString().slice(0, 10),
  format_type: "",
  theme: "",
};

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export default function AdsContentClusters() {
  const supabase = createClient() as any;
  const [items, setItems] = useState<ClusterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClusterItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadItems();
    loadClients();
  }, []);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from("ads_content_clusters")
        .select("*, client:clients(name)")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data as unknown as ClusterItem[]) || []);
    } catch (err) {
      toast.error("Gagal memuat clustering content: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  const formats = Array.from(new Set(items.map((i) => i.format_type).filter(Boolean))) as string[];

  const filtered = items.filter((it) => {
    if (clientFilter !== "all" && it.client_id !== clientFilter) return false;
    if (formatFilter !== "all" && it.format_type !== formatFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const clientName = it.client?.name?.toLowerCase() || "";
      const theme = it.theme?.toLowerCase() || "";
      const fmt = it.format_type?.toLowerCase() || "";
      if (!clientName.includes(q) && !theme.includes(q) && !fmt.includes(q)) return false;
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, entry_date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function openEdit(item: ClusterItem) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id || "",
      entry_date: (item.entry_date || "").slice(0, 10),
      format_type: item.format_type || "",
      theme: item.theme || "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.client_id) return toast.error("Pilih klien dulu");
    if (!form.format_type && !form.theme.trim()) return toast.error("Isi format atau theme");
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        entry_date: form.entry_date,
        format_type: form.format_type || null,
        theme: form.theme.trim() || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from("ads_content_clusters").update(payload).eq("id", editingId));
      } else {
        const user = (await supabase.auth.getUser()).data.user;
        ({ error } = await supabase.from("ads_content_clusters").insert({ ...payload, created_by: user?.id || null }));
      }
      if (error) throw error;
      toast.success(editingId ? "Cluster diperbarui" : "Cluster disimpan");
      setShowModal(false);
      loadItems();
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    try {
      const { error } = await supabase.from("ads_content_clusters").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      toast.success("Cluster dihapus");
      setConfirmDelete(null);
      loadItems();
    } catch (err) {
      toast.error("Gagal menghapus: " + extractError(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari theme / format / klien..."
            className="input pl-9"
          />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Klien</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Format</option>
          {formats.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setView("cards")}
            className={cn("p-2", view === "cards" ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground")}
            title="Card view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setView("table")}
            className={cn("p-2", view === "table" ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground")}
            title="Table view"
          >
            <List size={16} />
          </button>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus size={16} /> Entry Baru
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <Boxes className="mx-auto mb-3" size={32} />
          <p className="text-sm">Belum ada clustering content</p>
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <div key={it.id} className="card p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-foreground">{it.client?.name || "—"}</p>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <Calendar size={11} /> {formatDate(it.entry_date)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-surface text-muted" title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(it)}
                    className="p-1.5 rounded hover:bg-danger/10 text-danger"
                    title="Hapus"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {it.format_type && (
                <span className="inline-flex w-fit rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                  {it.format_type}
                </span>
              )}
              <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-5 flex-1">{it.theme || "—"}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Klien</th>
                <th className="p-3">Format</th>
                <th className="p-3">Theme</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="p-3 whitespace-nowrap text-muted">{formatDate(it.entry_date)}</td>
                  <td className="p-3 font-medium">{it.client?.name || "—"}</td>
                  <td className="p-3">
                    {it.format_type ? (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">{it.format_type}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 max-w-md">
                    <p className="line-clamp-2 whitespace-pre-wrap text-foreground/80">{it.theme || "—"}</p>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(it)} className="p-1.5 rounded hover:bg-surface text-muted" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(it)}
                      className="p-1.5 rounded hover:bg-danger/10 text-danger"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{editingId ? "Edit Cluster" : "Entry Cluster Baru"}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-surface">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Klien *</label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                  className="input"
                >
                  <option value="">Pilih klien</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tanggal</label>
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Format</label>
                <select
                  value={form.format_type}
                  onChange={(e) => setForm({ ...form, format_type: e.target.value })}
                  className="input"
                >
                  <option value="">Pilih format</option>
                  {Array.from(new Set([...FORMAT_OPTIONS, ...formats])).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Theme</label>
                <textarea
                  value={form.theme}
                  onChange={(e) => setForm({ ...form, theme: e.target.value })}
                  rows={4}
                  placeholder="Contoh: Edukasi manfaat produk, Testimoni customer..."
                  className="input resize-y"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-ghost">
                Batal
              </button>
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingId ? "Simpan Perubahan" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground">Hapus cluster ini?</h3>
            <p className="mt-2 text-sm text-muted">
              Cluster <span className="font-medium text-foreground">{confirmDelete.theme?.slice(0, 40) || confirmDelete.format_type || "—"}</span>{" "}
              akan dihapus permanen.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost">
                Batal
              </button>
              <button
                onClick={doDelete}
                disabled={deleting === confirmDelete.id}
                className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {deleting === confirmDelete.id && <Loader2 size={14} className="animate-spin" />}
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}