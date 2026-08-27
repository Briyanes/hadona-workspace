"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  Plus,
  Trash2,
  Search,
  Pencil,
  Copy,
  Loader2,
  LayoutGrid,
  List,
  Calendar,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface AdsCaptionItem {
  id: string;
  client_id: string | null;
  entry_date: string;
  angle: string | null;
  caption: string | null;
  created_at?: string;
  client?: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  client_id: "",
  entry_date: new Date().toISOString().slice(0, 10),
  angle: "",
  caption: "",
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

export default function AdsCaptionBank() {
  const supabase = createClient() as any;
  const [items, setItems] = useState<AdsCaptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdsCaptionItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadItems();
    loadClients();
  }, []);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from("ads_captions")
        .select("*, client:clients(name)")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data as unknown as AdsCaptionItem[]) || []);
    } catch (err) {
      toast.error("Gagal memuat banking caption: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  const filtered = items.filter((it) => {
    if (clientFilter !== "all" && it.client_id !== clientFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const clientName = it.client?.name?.toLowerCase() || "";
      const angle = it.angle?.toLowerCase() || "";
      const caption = it.caption?.toLowerCase() || "";
      if (!clientName.includes(q) && !angle.includes(q) && !caption.includes(q)) return false;
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, entry_date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function openEdit(item: AdsCaptionItem) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id || "",
      entry_date: (item.entry_date || "").slice(0, 10),
      angle: item.angle || "",
      caption: item.caption || "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.client_id) return toast.error("Pilih klien dulu");
    if (!form.angle.trim() && !form.caption.trim()) return toast.error("Isi angle atau caption");
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        entry_date: form.entry_date,
        angle: form.angle.trim() || null,
        caption: form.caption.trim() || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from("ads_captions").update(payload).eq("id", editingId));
      } else {
        const user = (await supabase.auth.getUser()).data.user;
        ({ error } = await supabase.from("ads_captions").insert({ ...payload, created_by: user?.id || null }));
      }
      if (error) throw error;
      toast.success(editingId ? "Caption diperbarui" : "Caption disimpan");
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
      const { error } = await supabase.from("ads_captions").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      toast.success("Caption dihapus");
      setConfirmDelete(null);
      loadItems();
    } catch (err) {
      toast.error("Gagal menghapus: " + extractError(err));
    } finally {
      setDeleting(null);
    }
  }

  function copyCaption(text: string | null) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success("Caption dicopy"));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari angle / caption / klien..."
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
          <BookMarked className="mx-auto mb-3" size={32} />
          <p className="text-sm">Belum ada banking caption</p>
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
                  <button onClick={() => copyCaption(it.caption)} className="p-1.5 rounded hover:bg-surface text-muted" title="Copy caption">
                    <Copy size={14} />
                  </button>
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
              {it.angle && (
                <span className="inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {it.angle}
                </span>
              )}
              <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-5 flex-1">{it.caption || "—"}</p>
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
                <th className="p-3">Angle</th>
                <th className="p-3">Caption</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="p-3 whitespace-nowrap text-muted">{formatDate(it.entry_date)}</td>
                  <td className="p-3 font-medium">{it.client?.name || "—"}</td>
                  <td className="p-3">
                    {it.angle ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{it.angle}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 max-w-md">
                    <p className="line-clamp-2 whitespace-pre-wrap text-foreground/80">{it.caption || "—"}</p>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => copyCaption(it.caption)} className="p-1.5 rounded hover:bg-surface text-muted" title="Copy">
                      <Copy size={14} />
                    </button>
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
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit Caption" : "Entry Caption Baru"}
        scrollable
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-ghost">
              Batal
            </button>
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingId ? "Simpan Perubahan" : "Simpan"}
            </button>
          </>
        }
      >
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
                <label className="label">Angle</label>
                <input
                  value={form.angle}
                  onChange={(e) => setForm({ ...form, angle: e.target.value })}
                  placeholder="Contoh: Problem-solution"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Caption</label>
                <textarea
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  rows={6}
                  placeholder="Tulis caption iklan..."
                  className="input resize-y"
                />
              </div>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        title="Hapus caption ini?"
        message={`Caption ${confirmDelete?.angle || confirmDelete?.caption?.slice(0, 40) || "—"} akan dihapus permanen.`}
        confirmText="Hapus"
        variant="danger"
        loading={!!confirmDelete && deleting === confirmDelete.id}
      />
    </div>
  );
}
