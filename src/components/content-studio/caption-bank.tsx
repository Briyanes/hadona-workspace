"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  Plus,
  X,
  Trash2,
  Search,
  Pencil,
  Copy,
  Loader2,
  TrendingUp,
  ThumbsDown,
  HelpCircle,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";

interface CaptionItem {
  id: string;
  client_id: string | null;
  product: string | null;
  theme: string | null;
  headline: string | null;
  caption: string | null;
  hashtags: string | null;
  performance: string;
  client?: { name: string };
}

interface Client {
  id: string;
  name: string;
}

const perfColors: Record<string, string> = {
  good: "bg-success/20 text-success",
  no: "bg-danger/20 text-danger",
  untested: "bg-surface text-muted",
};

const perfLabels: Record<string, string> = {
  good: "Good",
  no: "No",
  untested: "Untested",
};

const perfIcons: Record<string, typeof TrendingUp> = {
  good: TrendingUp,
  no: ThumbsDown,
  untested: HelpCircle,
};

const EMPTY_FORM = {
  client_id: "",
  product: "",
  theme: "",
  headline: "",
  caption: "",
  hashtags: "",
  performance: "untested",
};

export default function CaptionBank() {
  const supabase = createClient();
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [perfFilter, setPerfFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadCaptions();
    loadClients();
  }, [supabase]);

  async function loadCaptions() {
    try {
      const { data, error } = await supabase
        .from("caption_bank")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCaptions((data as unknown as CaptionItem[]) || []);
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal memuat caption bank: " + msg);
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

  function openEdit(item: CaptionItem) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id || "",
      product: item.product || "",
      theme: item.theme || "",
      headline: item.headline || "",
      caption: item.caption || "",
      hashtags: item.hashtags || "",
      performance: item.performance,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      client_id: form.client_id || null,
      product: form.product || null,
      theme: form.theme || null,
      headline: form.headline || null,
      caption: form.caption || null,
      hashtags: form.hashtags || null,
      performance: form.performance,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("caption_bank").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("Caption diupdate!");
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("caption_bank").insert({
          ...payload,
          created_by: userData.user?.id,
        } as never);
        if (error) throw error;
        toast.success("Caption ditambahkan!");
      }
      setForm({ ...EMPTY_FORM });
      setEditingId(null);
      setShowModal(false);
      loadCaptions();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function updatePerformance(id: string, performance: string) {
    const { error } = await supabase.from("caption_bank").update({ performance } as never).eq("id", id);
    if (error) {
      toast.error("Gagal update: " + error.message);
    } else {
      toast.success("Performance: " + perfLabels[performance]);
      loadCaptions();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus caption ini?")) return;
    const { error } = await supabase.from("caption_bank").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
    } else {
      toast.success("Caption dihapus");
      loadCaptions();
    }
  }

  function copyText(text: string | null, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(label + " disalin!");
  }

  const filtered = captions.filter((c) => {
    const matchSearch =
      !search ||
      c.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.product?.toLowerCase().includes(search.toLowerCase()) ||
      c.headline?.toLowerCase().includes(search.toLowerCase()) ||
      c.caption?.toLowerCase().includes(search.toLowerCase());
    const matchPerf = perfFilter === "all" || c.performance === perfFilter;
    const matchClient = clientFilter === "all" || c.client_id === clientFilter;
    return matchSearch && matchPerf && matchClient;
  });

  const goodCount = captions.filter((c) => c.performance === "good").length;
  const noCount = captions.filter((c) => c.performance === "no").length;
  const untestedCount = captions.filter((c) => c.performance === "untested").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <BookMarked className="text-primary" size={16} />
            <p className="text-xs uppercase text-muted">Total</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{captions.length}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-success" size={16} />
            <p className="text-xs uppercase text-muted">Good</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{goodCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <ThumbsDown className="text-danger" size={16} />
            <p className="text-xs uppercase text-muted">No</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{noCount}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="text-muted" size={16} />
            <p className="text-xs uppercase text-muted">Untested</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-foreground">{untestedCount}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input
              type="text"
              placeholder="Cari produk, headline, caption..."
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
          <select value={perfFilter} onChange={(e) => setPerfFilter(e.target.value)} className="input w-auto">
            <option value="all">Semua Performance</option>
            <option value="good">Good</option>
            <option value="no">No</option>
            <option value="untested">Untested</option>
          </select>
        </div>
        <button onClick={openCreate} className="btn-primary shrink-0">
          <Plus size={16} /> Tambah Caption
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <BookMarked className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada caption di bank</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Tambah Caption Pertama
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const PerfIcon = perfIcons[c.performance] || HelpCircle;
            return (
              <div key={c.id} className="card group flex flex-col">
                <div className="mb-2 flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">
                      {c.client?.name || "No Client"}
                    </h3>
                    {c.product && <p className="text-xs text-muted">{c.product}</p>}
                  </div>
                  <span className={cn("badge shrink-0", perfColors[c.performance] || perfColors.untested)}>
                    <PerfIcon size={10} className="mr-1" />
                    {perfLabels[c.performance] || c.performance}
                  </span>
                </div>

                {c.theme && (
                  <p className="mb-2 text-xs text-muted">
                    <span className="font-medium">Tema:</span> {c.theme}
                  </p>
                )}

                {c.headline && (
                  <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{c.headline}</p>
                      <button
                        onClick={() => copyText(c.headline, "Headline")}
                        className="shrink-0 rounded p-0.5 text-muted hover:text-primary"
                        title="Copy headline"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {c.caption && (
                  <div className="mb-2 flex-1 rounded-md border border-border bg-background p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-4 text-xs text-foreground">{c.caption}</p>
                      <button
                        onClick={() => copyText(c.caption, "Caption")}
                        className="shrink-0 rounded p-0.5 text-muted hover:text-primary"
                        title="Copy caption"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {c.hashtags && (
                  <p className="mb-3 text-[11px] text-primary/70">{c.hashtags}</p>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                  <select
                    value={c.performance}
                    onChange={(e) => updatePerformance(c.id, e.target.value)}
                    className="rounded-md border-0 bg-background px-2 py-1 text-xs font-medium"
                  >
                    <option value="untested">Untested</option>
                    <option value="good">Good</option>
                    <option value="no">No</option>
                  </select>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyText((c.caption || "") + "\n\n" + (c.hashtags || ""), "Full Caption")}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Copy All"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
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
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "Edit Caption" : "Caption Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
                <div className="grid grid-cols-2 gap-3">
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Produk</label>
                    <input
                      type="text"
                      value={form.product}
                      onChange={(e) => setForm({ ...form, product: e.target.value })}
                      placeholder="Contoh: Hybrid Hair Oil"
                      className="input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tema</label>
                    <input
                      type="text"
                      value={form.theme}
                      onChange={(e) => setForm({ ...form, theme: e.target.value })}
                      placeholder="Contoh: Edukasi, Promo, Testimoni"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Performance</label>
                    <select
                      value={form.performance}
                      onChange={(e) => setForm({ ...form, performance: e.target.value })}
                      className="input"
                    >
                      <option value="untested">Untested</option>
                      <option value="good">Good</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Headline</label>
                  <input
                    type="text"
                    value={form.headline}
                    onChange={(e) => setForm({ ...form, headline: e.target.value })}
                    placeholder="Primary text / headline iklan..."
                    className="input"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Caption</label>
                  <textarea
                    rows={5}
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Caption lengkap untuk iklan atau post..."
                    className="input resize-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Hashtags</label>
                  <textarea
                    rows={2}
                    value={form.hashtags}
                    onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                    placeholder="#hashtag1 #hashtag2 #hashtag3..."
                    className="input resize-none"
                  />
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : editingId ? (
                    "Update Caption"
                  ) : (
                    "Simpan Caption"
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