"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Plus,
  X,
  Trash2,
  Search,
  Pencil,
  ExternalLink,
  Loader2,
  BookMarked,
  Lightbulb,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";

interface CreativeRequest {
  id: string;
  client_id: string | null;
  status: string;
  request_date: string;
  objective: string | null;
  funnel: string | null;
  format_type: string | null;
  angle: string | null;
  content_link: string | null;
  hook: string | null;
  caption: string | null;
  cta: string | null;
  prefilled_message: string | null;
  notes: string | null;
  created_at?: string;
  client?: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", cls: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "on_progress", label: "On Progress", cls: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { value: "review", label: "Review", cls: "bg-purple-500/10 text-purple-600 border-purple-500/30" },
  { value: "done", label: "Done", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  { value: "published", label: "Published", cls: "bg-teal-500/10 text-teal-600 border-teal-500/30" },
];

const OBJECTIVE_OPTIONS = ["Awareness", "Traffic", "Engagement", "Leads", "Sales", "Messages (CTWA)"];
const FUNNEL_OPTIONS = ["TOF", "MOF", "BOF"];
const FORMAT_OPTIONS = ["Single Image", "Carousel", "Video", "Reels", "Story"];

const FUNNEL_HINTS: Record<string, string> = {
  TOF: "Top of Funnel — kenalan dulu. Angle: edukasi, relatable problem, kontroversi ringan. Jangan jualan keras.",
  MOF: "Middle of Funnel — pertimbangan. Angle: testimoni, before-after, perbandingan, jawab objection.",
  BOF: "Bottom of Funnel — closing. Angle: promo, urgensi/stok terbatas, garansi, CTA langsung ke WhatsApp.",
};

const EMPTY_FORM = {
  client_id: "",
  status: "pending",
  request_date: new Date().toISOString().slice(0, 10),
  objective: "",
  funnel: "",
  format_type: "",
  angle: "",
  content_link: "",
  hook: "",
  caption: "",
  cta: "",
  prefilled_message: "",
  notes: "",
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

function statusMeta(v: string) {
  return STATUS_OPTIONS.find((s) => s.value === v) || STATUS_OPTIONS[0];
}

export default function AdsCreativeRequests() {
  const supabase = createClient() as any;
  const [items, setItems] = useState<CreativeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CreativeRequest | null>(null);
  const [bankingId, setBankingId] = useState<string | null>(null);
  const [banking, setBanking] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    loadItems();
    loadClients();
  }, []);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from("ads_creative_requests")
        .select("*, client:clients(name)")
        .order("request_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data as unknown as CreativeRequest[]) || []);
    } catch (err) {
      toast.error("Gagal memuat creative request: " + extractError(err));
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
    if (statusFilter !== "all" && it.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        it.client?.name,
        it.angle,
        it.hook,
        it.caption,
        it.cta,
        it.objective,
        it.funnel,
        it.format_type,
      ]
        .map((s) => (s || "").toLowerCase())
        .join(" ");
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const counts = STATUS_OPTIONS.map((s) => ({
    ...s,
    count: items.filter((it) => it.status === s.value).length,
  }));

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, request_date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function openEdit(item: CreativeRequest) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id || "",
      status: item.status || "pending",
      request_date: (item.request_date || "").slice(0, 10),
      objective: item.objective || "",
      funnel: item.funnel || "",
      format_type: item.format_type || "",
      angle: item.angle || "",
      content_link: item.content_link || "",
      hook: item.hook || "",
      caption: item.caption || "",
      cta: item.cta || "",
      prefilled_message: item.prefilled_message || "",
      notes: item.notes || "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.client_id) return toast.error("Pilih klien dulu");
    if (!form.angle.trim() && !form.caption.trim() && !form.hook.trim()) return toast.error("Isi minimal angle, hook, atau caption");
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        status: form.status,
        request_date: form.request_date,
        objective: form.objective || null,
        funnel: form.funnel || null,
        format_type: form.format_type || null,
        angle: form.angle.trim() || null,
        content_link: form.content_link.trim() || null,
        hook: form.hook.trim() || null,
        caption: form.caption.trim() || null,
        cta: form.cta.trim() || null,
        prefilled_message: form.prefilled_message.trim() || null,
        notes: form.notes.trim() || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from("ads_creative_requests").update(payload).eq("id", editingId));
      } else {
        const user = (await supabase.auth.getUser()).data.user;
        ({ error } = await supabase.from("ads_creative_requests").insert({ ...payload, created_by: user?.id || null }));
      }
      if (error) throw error;
      toast.success(editingId ? "Request diperbarui" : "Request ditambahkan");
      setShowModal(false);
      loadItems();
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(item: CreativeRequest, status: string) {
    try {
      const { error } = await supabase.from("ads_creative_requests").update({ status }).eq("id", item.id);
      if (error) throw error;
      toast.success(`Status → ${statusMeta(status).label}`);
      loadItems();
    } catch (err) {
      toast.error("Gagal ubah status: " + extractError(err));
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(confirmDelete.id);
    try {
      const { error } = await supabase.from("ads_creative_requests").delete().eq("id", confirmDelete.id);
      if (error) throw error;
      toast.success("Request dihapus");
      setConfirmDelete(null);
      loadItems();
    } catch (err) {
      toast.error("Gagal menghapus: " + extractError(err));
    } finally {
      setDeleting(null);
    }
  }

  async function saveToBank() {
    if (!bankingId) return;
    const item = items.find((i) => i.id === bankingId);
    if (!item) return;
    if (!item.angle && !item.caption && !item.hook) {
      toast.error("Request ini belum punya angle/caption untuk disimpan");
      setBankingId(null);
      return;
    }
    setBanking(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const fullCaption = [item.hook, item.caption, item.cta].filter(Boolean).join("\n\n");
      const { error } = await supabase.from("ads_captions").insert({
        client_id: item.client_id,
        entry_date: item.request_date,
        angle: item.angle,
        caption: fullCaption || item.caption,
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Tersimpan ke Banking Caption ✓");
      setBankingId(null);
    } catch (err) {
      toast.error("Gagal menyimpan ke bank: " + extractError(err));
    } finally {
      setBanking(false);
    }
  }

  const hookLen = form.hook.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari angle / caption / klien / objective..."
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus size={16} /> Request Baru
        </button>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {counts.map((c) => (
          <button
            key={c.value}
            onClick={() => setStatusFilter(statusFilter === c.value ? "all" : c.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === c.value ? c.cls : "border-border bg-surface text-muted hover:text-foreground"
            )}
          >
            {c.label} · {c.count}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <ClipboardList className="mx-auto mb-3" size={32} />
          <p className="text-sm">Belum ada creative request</p>
          <p className="text-xs mt-1">Klik "Request Baru" untuk menambah permintaan creative iklan</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Status</th>
                <th className="p-3">Klien</th>
                <th className="p-3">Objective</th>
                <th className="p-3">Funnel</th>
                <th className="p-3">Format</th>
                <th className="p-3">Angle</th>
                <th className="p-3">Copy</th>
                <th className="p-3">Link</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const sm = statusMeta(it.status);
                const hasCopy = !!(it.hook || it.caption || it.cta || it.prefilled_message);
                return (
                  <tr key={it.id} className="border-b border-border/50 hover:bg-surface/50 align-top">
                    <td className="p-3 whitespace-nowrap text-muted">{formatDate(it.request_date)}</td>
                    <td className="p-3 whitespace-nowrap">
                      <select
                        value={it.status}
                        onChange={(e) => quickStatus(it, e.target.value)}
                        className={cn("rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer bg-transparent", sm.cls)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 font-medium whitespace-nowrap">{it.client?.name || "—"}</td>
                    <td className="p-3 text-muted whitespace-nowrap">{it.objective || "—"}</td>
                    <td className="p-3">
                      {it.funnel ? (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{it.funnel}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3 text-muted whitespace-nowrap">{it.format_type || "—"}</td>
                    <td className="p-3 max-w-[160px]">
                      <p className="line-clamp-2">{it.angle || "—"}</p>
                    </td>
                    <td className="p-3 max-w-[220px]">
                      {hasCopy ? (
                        <p className="line-clamp-2 text-foreground/80 whitespace-pre-wrap">
                          {it.hook || it.caption || "—"}
                          {it.hook && it.caption ? "…" : ""}
                        </p>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {it.content_link ? (
                        <a
                          href={it.content_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          title={it.content_link}
                        >
                          <ExternalLink size={13} /> Aset
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {(it.status === "done" || it.status === "published") && (it.angle || it.caption || it.hook) && (
                        <button
                          onClick={() => setBankingId(it.id)}
                          className="p-1.5 rounded hover:bg-primary/10 text-primary"
                          title="Simpan ke Banking Caption"
                        >
                          <BookMarked size={14} />
                        </button>
                      )}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="card w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{editingId ? "Edit Creative Request" : "Creative Request Baru"}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-surface">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="label">Tanggal Request</label>
                  <input
                    type="date"
                    value={form.request_date}
                    onChange={(e) => setForm({ ...form, request_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Objective Campaign</label>
                  <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="input">
                    <option value="">Pilih objective</option>
                    {OBJECTIVE_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Funnel</label>
                  <select value={form.funnel} onChange={(e) => setForm({ ...form, funnel: e.target.value })} className="input">
                    <option value="">Pilih funnel</option>
                    {FUNNEL_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Format</label>
                  <select value={form.format_type} onChange={(e) => setForm({ ...form, format_type: e.target.value })} className="input">
                    <option value="">Pilih format</option>
                    {FORMAT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Funnel hint */}
              {form.funnel && FUNNEL_HINTS[form.funnel] && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <Lightbulb size={14} className="mt-0.5 shrink-0" />
                  <p>{FUNNEL_HINTS[form.funnel]}</p>
                </div>
              )}

              <div>
                <label className="label">Angle (Request)</label>
                <input
                  value={form.angle}
                  onChange={(e) => setForm({ ...form, angle: e.target.value })}
                  placeholder="Contoh: Promo Diskon / Testimoni / Before-After"
                  className="input"
                />
              </div>

              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Naskah Copy</p>
                <div>
                  <label className="label flex items-center justify-between">
                    <span>Hook (pembuka)</span>
                    <span className={cn("text-xs font-normal", hookLen > 125 ? "text-danger" : "text-muted")}>
                      {hookLen}/125
                    </span>
                  </label>
                  <textarea
                    value={form.hook}
                    onChange={(e) => setForm({ ...form, hook: e.target.value })}
                    rows={2}
                    placeholder={'Kalimat pembuka yang terlihat sebelum "See more"...'}
                    className="input resize-y"
                  />
                </div>
                <div>
                  <label className="label">Caption (Body)</label>
                  <textarea
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    rows={4}
                    placeholder="Masalah → Solusi → Bukti..."
                    className="input resize-y"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">CTA</label>
                    <input
                      value={form.cta}
                      onChange={(e) => setForm({ ...form, cta: e.target.value })}
                      placeholder="Contoh: Cek keranjang kuning sekarang"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Prefilled Message (CTWA)</label>
                    <input
                      value={form.prefilled_message}
                      onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })}
                      placeholder="Halo kak, saya mau tanya produk..."
                      className="input"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Content Link (Aset)</label>
                  <input
                    value={form.content_link}
                    onChange={(e) => setForm({ ...form, content_link: e.target.value })}
                    placeholder="https://drive.google.com/..."
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Catatan</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Catatan tambahan untuk request ini..."
                    className="input resize-y"
                  />
                </div>
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

      {/* Confirm Save to Bank */}
      {bankingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setBankingId(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <BookMarked size={16} className="text-primary" /> Simpan ke Banking Caption?
            </h3>
            <p className="mt-2 text-sm text-muted">
              Hook + caption + CTA dari request ini akan disimpan ke Banking Caption untuk dipakai ulang nanti.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setBankingId(null)} className="btn-ghost">
                Batal
              </button>
              <button onClick={saveToBank} disabled={banking} className="btn-primary flex items-center gap-2">
                {banking && <Loader2 size={14} className="animate-spin" />}
                Simpan ke Bank
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground">Hapus request ini?</h3>
            <p className="mt-2 text-sm text-muted">
              Request <span className="font-medium text-foreground">{confirmDelete.angle || confirmDelete.client?.name || "—"}</span> akan
              dihapus permanen.
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