"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Search, Megaphone, Loader2, Pencil, ExternalLink, Power, Copy,
} from "lucide-react";

const OBJECTIVES = ["CTWA", "CTLP", "CPAS", "Visit Profile"];
const FUNNELS = ["TOFU", "MOFU", "BOFU"];
const FORMATS = ["Single Image", "Video", "Carousel"];

interface AdRow {
  id: string;
  ad_no: string | null;
  ad_status: string | null;
  tanggal: string | null;
  objective: string | null;
  funnel: string | null;
  format_type: string | null;
  angle: string | null;
  content_link: string | null;
  caption: string | null;
  prefilled_message: string | null;
  client_label: string | null;
  client_id: string | null;
}

interface Client { id: string; name: string; }

const emptyForm = {
  ad_no: "", ad_status: "off", tanggal: "", objective: "", funnel: "",
  format_type: "", angle: "", content_link: "", caption: "", prefilled_message: "",
};

export default function AdsManager() {
  // eslint-disable-next-line
  const supabase = createClient() as any;
  const [rows, setRows] = useState<AdRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fClient, setFClient] = useState("all");
  const [fObjective, setFObjective] = useState("all");
  const [fFunnel, setFFunnel] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [editing, setEditing] = useState<AdRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [adsRes, clientsRes] = await Promise.all([
        supabase
          .from("content_uploads")
          .select("id, ad_no, ad_status, tanggal, objective, funnel, format_type, angle, content_link, caption, prefilled_message, client_label, client_id")
          .not("sheet_name", "is", null)
          .order("sheet_name")
          .order("sheet_row_no"),
        supabase.from("clients").select("id, name"),
      ]);
      if (adsRes.error) throw adsRes.error;
      setRows((adsRes.data as AdRow[]) || []);
      setClients((clientsRes.data as Client[]) || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal memuat data ads. Jalankan migrasi v84 dulu. " + msg);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      if (fClient !== "all" && r.client_id !== fClient) return false;
      if (fObjective !== "all" && r.objective !== fObjective) return false;
      if (fFunnel !== "all" && r.funnel !== fFunnel) return false;
      if (fStatus !== "all" && (r.ad_status || "off") !== fStatus) return false;
      if (q) {
        const hay = `${r.client_label || ""} ${r.caption || ""} ${r.angle || ""} ${r.ad_no || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fClient, fObjective, fFunnel, fStatus]);

  function openEdit(r: AdRow) {
    setEditing(r);
    setForm({
      ad_no: r.ad_no || "",
      ad_status: r.ad_status || "off",
      tanggal: r.tanggal || "",
      objective: r.objective || "",
      funnel: r.funnel || "",
      format_type: r.format_type || "",
      angle: r.angle || "",
      content_link: r.content_link || "",
      caption: r.caption || "",
      prefilled_message: r.prefilled_message || "",
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("content_uploads")
        .update({
          ad_no: form.ad_no || null,
          ad_status: form.ad_status,
          tanggal: form.tanggal || null,
          objective: form.objective || null,
          funnel: form.funnel || null,
          format_type: form.format_type || null,
          angle: form.angle || null,
          content_link: form.content_link || null,
          caption: form.caption || null,
          prefilled_message: form.prefilled_message || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Ad diperbarui");
      setEditing(null);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: AdRow) {
    const next = r.ad_status === "active" ? "off" : "active";
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ad_status: next } : x)));
    const { error } = await supabase
      .from("content_uploads")
      .update({ ad_status: next })
      .eq("id", r.id);
    if (error) {
      toast.error("Gagal mengubah status");
      load();
    }
  }

  function copyText(text: string | null) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard");
  }

  const badgeFor = (s: string | null) =>
    s === "active"
      ? "badge bg-success/15 text-success"
      : "badge bg-muted/15 text-muted";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari client, caption, angle..."
            className="input pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="input">
            <option value="all">Semua Client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={fObjective} onChange={(e) => setFObjective(e.target.value)} className="input">
            <option value="all">Objective</option>
            {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fFunnel} onChange={(e) => setFFunnel(e.target.value)} className="input">
            <option value="all">Funnel</option>
            {FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="input">
            <option value="all">Status</option>
            <option value="active">Active</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-muted" size={24} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Megaphone size={32} className="mx-auto mb-3 text-muted" />
          <p className="text-sm font-medium text-foreground">Belum ada data ads</p>
          <p className="text-xs text-muted">
            Import dari Google Sheet via <code>npm run import:content-ads</code> (butuh migrasi v84)
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th className="px-3 py-2.5">Client</th>
                  <th className="px-3 py-2.5">No</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Objective</th>
                  <th className="px-3 py-2.5">Funnel</th>
                  <th className="px-3 py-2.5">Format</th>
                  <th className="px-3 py-2.5">Angle</th>
                  <th className="px-3 py-2.5">Caption</th>
                  <th className="px-3 py-2.5">Link</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/5">
                    <td className="px-3 py-2.5 font-medium text-foreground">{r.client_label || "-"}</td>
                    <td className="px-3 py-2.5 text-muted">{r.ad_no || "-"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleActive(r)} className={badgeFor(r.ad_status)}>
                        <Power size={11} className="mr-1 inline" />
                        {r.ad_status === "active" ? "Active" : "Off"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">{r.objective || "-"}</td>
                    <td className="px-3 py-2.5">{r.funnel || "-"}</td>
                    <td className="px-3 py-2.5 text-muted">{r.format_type || "-"}</td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-muted" title={r.angle || ""}>{r.angle || "-"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2.5" title={r.caption || ""}>
                      <button onClick={() => copyText(r.caption)} className="text-left hover:text-primary" title="Klik untuk salin">
                        {r.caption || "-"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.content_link ? (
                        <a href={r.content_link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          <ExternalLink size={14} />
                        </a>
                      ) : "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => openEdit(r)} className="text-muted hover:text-primary">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">{r.client_label || "-"}</p>
                    <p className="text-xs text-muted">No. {r.ad_no || "-"} · {r.format_type || "-"}</p>
                  </div>
                  <button onClick={() => toggleActive(r)} className={badgeFor(r.ad_status)}>
                    {r.ad_status === "active" ? "Active" : "Off"}
                  </button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {r.objective && <span className="badge bg-primary/10 text-primary">{r.objective}</span>}
                  {r.funnel && <span className="badge bg-accent/10 text-accent">{r.funnel}</span>}
                  {r.tanggal && <span className="badge bg-muted/10 text-muted">{r.tanggal}</span>}
                </div>
                {r.angle && <p className="mb-1 text-xs text-muted">Angle: {r.angle}</p>}
                {r.caption && (
                  <button onClick={() => copyText(r.caption)} className="mb-2 w-full rounded bg-muted/10 p-2 text-left text-xs hover:bg-muted/20">
                    {r.caption.length > 120 ? r.caption.substring(0, 120) + "..." : r.caption}
                  </button>
                )}
                <div className="flex items-center gap-3">
                  {r.content_link && (
                    <a href={r.content_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary">
                      <ExternalLink size={12} /> Content
                    </a>
                  )}
                  <button onClick={() => openEdit(r)} className="ml-auto flex items-center gap-1 text-xs text-muted">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">{filtered.length} dari {rows.length} ads</p>
        </>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                Edit Ad — {editing.client_label}
              </h3>
              <button onClick={() => setEditing(null)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">No.</label>
                  <input value={form.ad_no} onChange={(e) => setForm({ ...form, ad_no: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Tanggal</label>
                  <input value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} className="input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Status</label>
                  <select value={form.ad_status} onChange={(e) => setForm({ ...form, ad_status: e.target.value })} className="input">
                    <option value="active">Active</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Objective Campaign</label>
                  <select value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="input">
                    <option value="">—</option>
                    {OBJECTIVES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Funnel</label>
                  <select value={form.funnel} onChange={(e) => setForm({ ...form, funnel: e.target.value })} className="input">
                    <option value="">—</option>
                    {FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Format</label>
                  <select value={form.format_type} onChange={(e) => setForm({ ...form, format_type: e.target.value })} className="input">
                    <option value="">—</option>
                    {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                  Angle (Request)
                  <button onClick={() => copyText(form.angle)} className="text-muted hover:text-primary"><Copy size={12} /></button>
                </label>
                <input value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Content Link</label>
                <input value={form.content_link} onChange={(e) => setForm({ ...form, content_link: e.target.value })} className="input" />
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                  Caption
                  <button onClick={() => copyText(form.caption)} className="text-muted hover:text-primary"><Copy size={12} /></button>
                </label>
                <textarea value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} rows={4} className="input" />
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                  Prefilled Message (CTWA)
                  <button onClick={() => copyText(form.prefilled_message)} className="text-muted hover:text-primary"><Copy size={12} /></button>
                </label>
                <textarea value={form.prefilled_message} onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })} rows={3} className="input" />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="btn-secondary">Batal</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? <Loader2 size={14} className="animate-spin" /> : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}