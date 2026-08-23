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
  ExternalLink,
  Copy,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";

interface ClusterItem {
  id: string;
  client_id: string | null;
  entry_date: string;
  format_type: string | null;
  theme: string | null;
  pillar?: string | null;
  content_copy?: string | null;
  details?: string | null;
  referensi?: string | null;
  caption?: string | null;
  thumbnail?: string | null;
  progress?: string | null;
  result_link?: string | null;
  assets?: string | null;
  upload_date?: string | null;
  client_hint?: string | null;
  source_sheet?: string | null;
  sheet_row?: number | null;
  created_at?: string;
  client?: { name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

// Dropdown values — mirror master spreadsheet (publish)
const STATUS_OPTIONS = ["Active", "Inactive"];
const OBJECTIVE_OPTIONS = ["CTWA", "CTLP", "CPAS", "VISIT PROFILE"];
const FUNNEL_OPTIONS = ["TOFU", "MOFU", "BOFU"];
const FORMAT_OPTIONS = ["Single Image", "Carousel", "Video"];

// Post Type — derived dari caption (bukan kolom DB):
// tanpa caption = Existing Post, ada caption = Manual Upload
const POST_TYPE_MANUAL = "Manual Upload";
const POST_TYPE_EXISTING = "Existing Post";
const POST_TYPE_OPTIONS = [POST_TYPE_EXISTING, POST_TYPE_MANUAL];

type PostTypeSource = Pick<ClusterItem, "caption" | "progress" | "theme" | "result_link" | "format_type">;

function postType(it: PostTypeSource): string | null {
  if (it.caption && it.caption.trim()) return POST_TYPE_MANUAL;
  const hasContent =
    (it.progress && it.progress.trim()) ||
    (it.theme && it.theme.trim()) ||
    (it.result_link && it.result_link.trim()) ||
    (it.format_type && it.format_type.trim());
  return hasContent ? POST_TYPE_EXISTING : null;
}

// Kelengkapan data — flag entry yang link/caption/prefilled-nya belum ada
// (sumber: cell notes "Copy di Note" / hyperlink yang belum diekstrak)
type CompletenessSource = Pick<ClusterItem, "details" | "result_link" | "caption" | "content_copy">;

function completeness(it: CompletenessSource): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!it.result_link) missing.push("Link");
  if (!it.caption) missing.push("Caption");
  const ctwa = (it.details || "").toUpperCase().includes("CTWA");
  if (ctwa && !it.content_copy) missing.push("Prefilled");
  return { complete: missing.length === 0, missing };
}

const COMPLETENESS_OPTIONS = [
  { value: "missing_link", label: "⚠ Link Belum Ada" },
  { value: "missing_caption", label: "⚠ Caption Belum Ada" },
  { value: "incomplete", label: "⚠ Belum Lengkap" },
  { value: "complete", label: "✓ Lengkap" },
];

const EMPTY_FORM = {
  client_id: "",
  status: "",
  upload_date: "",
  objective: "",
  funnel: "",
  format: "",
  angle: "",
  content_link: "",
  caption: "",
  prefilled: "",
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

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Disalin ke clipboard");
    } catch {
      toast.error("Gagal menyalin");
    }
  }

  function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  const active = status.toLowerCase() === "active";
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted"
      )}
    >
      {status}
    </span>
  );
}

function PostTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  const manual = type === POST_TYPE_MANUAL;
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium",
        manual ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-600"
      )}
    >
      {type}
    </span>
  );
}

export default function AdsContentClusters() {
  const supabase = createClient() as any;
  const [items, setItems] = useState<ClusterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [funnelFilter, setFunnelFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [postTypeFilter, setPostTypeFilter] = useState("all");
  const [completenessFilter, setCompletenessFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClusterItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [detail, setDetail] = useState<ClusterItem | null>(null);

  useEffect(() => {
    loadItems();
    loadClients();
  }, []);

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from("ads_content_clusters")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setItems((data as unknown as ClusterItem[]) || []);
    } catch (err) {
      toast.error("Gagal memuat ads creative: " + extractError(err));
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
    if (statusFilter !== "all" && it.progress !== statusFilter) return false;
    if (objectiveFilter !== "all" && it.details !== objectiveFilter) return false;
    if (funnelFilter !== "all" && it.pillar !== funnelFilter) return false;
    if (formatFilter !== "all" && it.format_type !== formatFilter) return false;
    if (postTypeFilter !== "all" && postType(it) !== postTypeFilter) return false;
    if (completenessFilter !== "all") {
      const c = completeness(it);
      if (completenessFilter === "missing_link" && it.result_link) return false;
      if (completenessFilter === "missing_caption" && it.caption) return false;
      if (completenessFilter === "incomplete" && c.complete) return false;
      if (completenessFilter === "complete" && !c.complete) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const clientName = it.client?.name?.toLowerCase() || it.client_hint?.toLowerCase() || "";
      const theme = it.theme?.toLowerCase() || "";
      const fmt = it.format_type?.toLowerCase() || "";
      const pillar = it.pillar?.toLowerCase() || "";
      const caption = it.caption?.toLowerCase() || "";
      if (!clientName.includes(q) && !theme.includes(q) && !fmt.includes(q) && !pillar.includes(q) && !caption.includes(q))
        return false;
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(item: ClusterItem) {
    setEditingId(item.id);
    setForm({
      client_id: item.client_id || "",
      status: item.progress || "",
      upload_date: (item.upload_date || "").slice(0, 10),
      objective: item.details || "",
      funnel: item.pillar || "",
      format: item.format_type || "",
      angle: item.theme || "",
      content_link: item.result_link || "",
      caption: item.caption || "",
      prefilled: item.content_copy || "",
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.client_id) return toast.error("Pilih klien dulu");
    if (!form.format && !form.angle.trim()) return toast.error("Isi format atau angle (request)");
    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id,
        progress: form.status || null,
        upload_date: form.upload_date || null,
        details: form.objective || null,
        pillar: form.funnel || null,
        format_type: form.format || null,
        theme: form.angle.trim() || null,
        result_link: form.content_link.trim() || null,
        caption: form.caption.trim() || null,
        content_copy: form.prefilled.trim() || null,
      };
      let error;
      if (editingId) {
        ({ error } = await supabase.from("ads_content_clusters").update(payload).eq("id", editingId));
      } else {
        const user = (await supabase.auth.getUser()).data.user;
        ({ error } = await supabase.from("ads_content_clusters").insert({ ...payload, created_by: user?.id || null }));
      }
      if (error) throw error;
      toast.success(editingId ? "Ads creative diperbarui" : "Ads creative disimpan");
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
      toast.success("Ads creative dihapus");
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={objectiveFilter} onChange={(e) => setObjectiveFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Objective</option>
          {OBJECTIVE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={funnelFilter} onChange={(e) => setFunnelFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Funnel</option>
          {FUNNEL_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Format</option>
          {FORMAT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={postTypeFilter} onChange={(e) => setPostTypeFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Post Type</option>
          {POST_TYPE_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={completenessFilter} onChange={(e) => setCompletenessFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Kelengkapan</option>
          {COMPLETENESS_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
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
          <p className="text-sm">Belum ada ads creative</p>
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <div
              key={it.id}
              className="card p-4 flex flex-col gap-2 cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setDetail(it)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm text-foreground">{it.client?.name || it.client_hint || "—"}</p>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <Calendar size={11} /> {formatDate(it.upload_date)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={it.progress} />
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
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
              </div>
              <div className="flex flex-wrap gap-1.5">
                {postType(it) && <PostTypeBadge type={postType(it)} />}
                {it.details && (
                  <span className="inline-flex w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {it.details}
                  </span>
                )}
                {it.pillar && (
                  <span className="inline-flex w-fit rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{it.pillar}</span>
                )}
                {it.format_type && (
                  <span className="inline-flex w-fit rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                    {it.format_type}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-5 flex-1">{it.theme || "—"}</p>
              {it.result_link ? (
                <a
                  href={it.result_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline w-fit"
                >
                  <ExternalLink size={11} /> Content Link
                </a>
              ) : (
                (() => {
                  const extra = completeness(it).missing.filter((m) => m !== "Link");
                  return (
                    <span className="inline-flex w-fit items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                      ⚠ Link belum ada{extra.length ? ` (+${extra.length})` : ""}
                    </span>
                  );
                })()
              )}
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
                <th className="p-3">Status</th>
                <th className="p-3">Objective</th>
                <th className="p-3">Funnel</th>
                <th className="p-3">Format</th>
                <th className="p-3">Post Type</th>
                <th className="p-3">Angle (Request)</th>
                <th className="p-3">Content Link</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-surface/50 cursor-pointer" onClick={() => setDetail(it)}>
                  <td className="p-3 whitespace-nowrap text-muted">{formatDate(it.upload_date)}</td>
                  <td className="p-3 font-medium">{it.client?.name || it.client_hint || "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={it.progress} />
                  </td>
                  <td className="p-3 text-xs">{it.details || "—"}</td>
                  <td className="p-3 text-xs">{it.pillar || "—"}</td>
                  <td className="p-3">
                    {it.format_type ? (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">{it.format_type}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">{postType(it) ? <PostTypeBadge type={postType(it)} /> : "—"}</td>
                  <td className="p-3 max-w-sm">
                    <p className="line-clamp-2 whitespace-pre-wrap text-foreground/80">{it.theme || "—"}</p>
                  </td>
                  <td className="p-3 max-w-[120px]">
                    {it.result_link ? (
                      <a
                        href={it.result_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline"
                        title={it.result_link}
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-amber-600" title="Belum ada link — cek sheet sumber / cell notes">
                        belum ada
                      </span>
                    )}
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
              <h3 className="font-semibold text-foreground">{editingId ? "Edit Ads Creative" : "Entry Ads Creative Baru"}</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
                    <option value="">—</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tanggal</label>
                  <input
                    type="date"
                    value={form.upload_date}
                    onChange={(e) => setForm({ ...form, upload_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Objective Campaign</label>
                <select
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  className="input"
                >
                  <option value="">—</option>
                  {OBJECTIVE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Funnel</label>
                  <select value={form.funnel} onChange={(e) => setForm({ ...form, funnel: e.target.value })} className="input">
                    <option value="">—</option>
                    {FUNNEL_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Format</label>
                  <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="input">
                    <option value="">—</option>
                    {FORMAT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Angle (Request)</label>
                <textarea
                  value={form.angle}
                  onChange={(e) => setForm({ ...form, angle: e.target.value })}
                  rows={4}
                  placeholder="Angle / request dari klien..."
                  className="input resize-y"
                />
              </div>
              <div>
                <label className="label">Content Link</label>
                <input
                  type="url"
                  value={form.content_link}
                  onChange={(e) => setForm({ ...form, content_link: e.target.value })}
                  placeholder="https://..."
                  className="input"
                />
              </div>
              <div>
                <label className="label">Caption</label>
                <textarea
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                  rows={3}
                  placeholder="Caption iklan..."
                  className="input resize-y"
                />
                <p className="mt-1 text-xs text-muted">
                  Post Type otomatis: kosong = <span className="font-medium text-amber-600">Existing Post</span>, terisi ={" "}
                  <span className="font-medium text-primary">Manual Upload</span>
                </p>
              </div>
              <div>
                <label className="label">Prefilled Message (If Use CTWA Campaign)</label>
                <textarea
                  value={form.prefilled}
                  onChange={(e) => setForm({ ...form, prefilled: e.target.value })}
                  rows={2}
                  placeholder="Pesan prefilled WA..."
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

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="card w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">{detail.theme || detail.format_type || "Detail"}</h3>
                <p className="text-xs text-muted mt-0.5">
                  {detail.client?.name || detail.client_hint || "—"}
                  {detail.source_sheet && ` • sumber: ${detail.source_sheet}${detail.sheet_row ? ` (row ${detail.sheet_row})` : ""}`}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded hover:bg-surface">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                ["Status", detail.progress],
                ["Objective Campaign", detail.details],
                ["Funnel", detail.pillar],
                ["Format", detail.format_type],
                ["Post Type", postType(detail)],
                ["Angle (Request)", detail.theme],
                ["Caption", detail.caption],
                ["Prefilled Message", detail.content_copy],
                ["Tanggal", detail.upload_date ? formatDate(detail.upload_date) : null],
              ].map(([label, value]) => {
                if (!value) return null;
                const copyable =
                  label === "Caption" || label === "Prefilled Message" || label === "Angle (Request)";
                return (
                  <div key={label as string} className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-muted text-xs pt-0.5">{label}</span>
                    <div className="flex items-start gap-1.5">
                      <p className="whitespace-pre-wrap text-foreground/90 break-words flex-1">{value as string}</p>
                      {copyable && (
                        <button
                          onClick={() => copyText(value as string)}
                          className="shrink-0 mt-0.5 p-1 rounded hover:bg-surface text-muted hover:text-foreground"
                          title="Copy ke clipboard"
                        >
                          <Copy size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {detail.result_link && (
                <div className="grid grid-cols-[140px_1fr] gap-3">
                  <span className="text-muted text-xs pt-0.5">Content Link</span>
                  <a href={detail.result_link} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                    {detail.result_link}
                  </a>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDetail(null);
                  openEdit(detail);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <Pencil size={14} /> Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-foreground">Hapus ads creative ini?</h3>
            <p className="mt-2 text-sm text-muted">
              Entry <span className="font-medium text-foreground">{confirmDelete.theme?.slice(0, 40) || confirmDelete.format_type || "—"}</span>{" "}
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
