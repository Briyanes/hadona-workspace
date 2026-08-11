"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Search, X, Palette, FileText, ImageIcon, Type, Loader2,
  MoreVertical, Pencil, Trash2, AlertCircle, ExternalLink, Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { uploadFile } from "@/lib/upload";

interface BrandKit {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  font_primary: string | null;
  font_secondary: string | null;
  brand_voice: string | null;
  guidelines_url: string | null;
  created_at: string;
  client_name?: string | null;
}

interface BrandAsset {
  id: string;
  brand_kit_id: string;
  name: string;
  type: string;
  file_url: string;
  thumbnail_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  tags: string[];
}

interface Client { id: string; name: string; }

const ASSET_TYPES = [
  { value: "logo", label: "Logo", icon: ImageIcon },
  { value: "color_palette", label: "Color Palette", icon: Palette },
  { value: "font", label: "Font", icon: Type },
  { value: "template", label: "Template", icon: FileText },
  { value: "guideline", label: "Guideline", icon: FileText },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "video", label: "Video", icon: FileText },
  { value: "other", label: "Other", icon: FileText },
] as const;

const emptyForm = {
  client_id: "",
  name: "",
  description: "",
  primary_color: "#000000",
  secondary_color: "#FFFFFF",
  accent_color: "",
  font_primary: "",
  font_secondary: "",
  brand_voice: "",
  guidelines_url: "",
};

export default function BrandKitsPage() {
  const supabase = createClient();
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [assets, setAssets] = useState<Record<string, BrandAsset[]>>({});
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedKit, setExpandedKit] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [uploadingForKit, setUploadingForKit] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [{ data: kitData, error: err1 }, { data: clientData }] = await Promise.all([
        supabase.from("brand_kits").select("*").order("created_at", { ascending: false }),
        supabase.from("clients").select("id, name").order("name"),
      ]);

      if (err1) throw err1;

      const clientMap = new Map((clientData || []).map((c: any) => [c.id, c.name]));
      const enriched = (kitData || []).map((k: any) => ({
        ...k,
        client_name: k.client_id ? clientMap.get(k.client_id) : null,
      }));

      setBrandKits(enriched);
      setClients((clientData as unknown as Client[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError("Gagal memuat brand kits: " + msg);
      toast.error("Gagal memuat data brand kits");
    } finally {
      setLoading(false);
    }
  }

  async function loadAssets(kitId: string) {
    try {
      const { data, error: err } = await supabase
        .from("brand_assets")
        .select("*")
        .eq("brand_kit_id", kitId)
        .order("created_at", { ascending: false });
      if (err) throw err;
      setAssets((prev) => ({ ...prev, [kitId]: (data as unknown as BrandAsset[]) || [] }));
    } catch (err) {
      console.error("Failed to load assets:", err);
    }
  }

  const filtered = useMemo(() => {
    return brandKits.filter((k) => {
      const matchSearch = !search || k.name?.toLowerCase().includes(search.toLowerCase()) || k.client_name?.toLowerCase().includes(search.toLowerCase());
      return matchSearch;
    });
  }, [brandKits, search]);

  function openCreate() { setForm(emptyForm); setEditingId(null); setShowModal(true); }

  function openEdit(k: BrandKit) {
    setForm({
      client_id: k.client_id || "",
      name: k.name,
      description: k.description || "",
      primary_color: k.primary_color || "#000000",
      secondary_color: k.secondary_color || "#FFFFFF",
      accent_color: k.accent_color || "",
      font_primary: k.font_primary || "",
      font_secondary: k.font_secondary || "",
      brand_voice: k.brand_voice || "",
      guidelines_url: k.guidelines_url || "",
    });
    setEditingId(k.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name wajib diisi"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        name: form.name.trim(),
        client_id: form.client_id || null,
        description: form.description.trim() || null,
        primary_color: form.primary_color || "#000000",
        secondary_color: form.secondary_color || "#FFFFFF",
        accent_color: form.accent_color || null,
        font_primary: form.font_primary || null,
        font_secondary: form.font_secondary || null,
        brand_voice: form.brand_voice || null,
        guidelines_url: form.guidelines_url || null,
        ...(editingId ? {} : { created_by: user?.id }),
      };

      if (editingId) {
        const { error: err } = await supabase.from("brand_kits").update(payload as never).eq("id", editingId);
        if (err) throw err;
        toast.success("Brand kit diupdate!");
      } else {
        const { error: err } = await supabase.from("brand_kits").insert(payload as never);
        if (err) throw err;
        toast.success("Brand kit dibuat!");
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
      const { error: err } = await supabase.from("brand_kits").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Brand kit dihapus");
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function handleUploadAsset(kitId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingForKit(kitId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { publicUrl } = await uploadFile(file, "creative-assets");
      const assetName = file.name.replace(/\.[^/.]+$/, "");

      const { error: err } = await supabase.from("brand_assets").insert({
        brand_kit_id: kitId,
        name: assetName,
        type: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "other",
        file_url: publicUrl,
        file_size: file.size,
        mime_type: file.type,
        tags: [],
        uploaded_by: user?.id,
      } as never);
      if (err) throw err;
      toast.success("Asset diupload!");
      loadAssets(kitId);
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal upload: " + msg);
    } finally {
      setUploadingForKit(null);
      e.target.value = ""; // reset input
    }
  }

  async function handleDeleteAsset(assetId: string, kitId: string) {
    try {
      const { error: err } = await supabase.from("brand_assets").delete().eq("id", assetId);
      if (err) throw err;
      toast.success("Asset dihapus");
      loadAssets(kitId);
    } catch (err) {
      let msg = "Unknown error";
      if (err && typeof err === "object" && "message" in err) msg = String((err as any).message);
      toast.error("Gagal: " + msg);
    }
  }

  function toggleExpand(kitId: string) {
    if (expandedKit === kitId) {
      setExpandedKit(null);
    } else {
      setExpandedKit(kitId);
      if (!assets[kitId]) loadAssets(kitId);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">Brand Kits</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-40 rounded-lg" />)}
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
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Brand Kits"
        subtitle="Brand guidelines dan asset library per client"
        actions={<button onClick={openCreate} className="btn-primary"><Plus size={16} /> New Brand Kit</button>}
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input type="text" placeholder="Cari brand kit atau client..." value={search} onChange={(e) => setSearch(e.target.value)} className="input py-1.5 pl-8 text-xs" />
        {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"><X size={14} /></button>}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Palette className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada brand kit</p>
          <button onClick={openCreate} className="btn-primary mt-4"><Plus size={16} /> Buat Brand Kit Pertama</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((k) => (
            <div key={k.id} className="card overflow-hidden">
              {/* Color bar */}
              <div className="flex h-3">
                <div className="flex-1" style={{ backgroundColor: k.primary_color || "#000" }} />
                <div className="flex-1" style={{ backgroundColor: k.secondary_color || "#FFF" }} />
                {k.accent_color && <div className="flex-1" style={{ backgroundColor: k.accent_color }} />}
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{k.name}</h3>
                    {k.client_name && <p className="text-xs text-muted">🏢 {k.client_name}</p>}
                  </div>
                  <div className="relative">
                    <button onClick={() => setMenuOpenId(menuOpenId === k.id ? null : k.id)} className="rounded p-1.5 text-muted hover:bg-background hover:text-primary">
                      <MoreVertical size={14} />
                    </button>
                    {menuOpenId === k.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                          <button onClick={() => { openEdit(k); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-primary/5">
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => { setDeleteTarget({ id: k.id, name: k.name }); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-danger/5">
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {k.description && <p className="mb-3 text-sm text-muted">{k.description}</p>}

                {/* Colors */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-[10px]">
                    <div className="h-3 w-3 rounded border border-border" style={{ backgroundColor: k.primary_color || "#000" }} />
                    <span className="text-muted">Primary</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-[10px]">
                    <div className="h-3 w-3 rounded border border-border" style={{ backgroundColor: k.secondary_color || "#FFF" }} />
                    <span className="text-muted">Secondary</span>
                  </div>
                  {k.accent_color && (
                    <div className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1 text-[10px]">
                      <div className="h-3 w-3 rounded border border-border" style={{ backgroundColor: k.accent_color }} />
                      <span className="text-muted">Accent</span>
                    </div>
                  )}
                </div>

                {/* Fonts */}
                {(k.font_primary || k.font_secondary) && (
                  <div className="mb-3 space-y-1">
                    {k.font_primary && <p className="text-xs text-muted">Aa — {k.font_primary}</p>}
                    {k.font_secondary && <p className="text-xs text-muted">Aa — {k.font_secondary}</p>}
                  </div>
                )}

                {/* Brand Voice */}
                {k.brand_voice && (
                  <div className="mb-3 rounded-md bg-background p-2 text-xs text-muted">
                    <strong>Brand Voice:</strong> {k.brand_voice}
                  </div>
                )}

                {/* Guidelines link */}
                {k.guidelines_url && (
                  <a href={k.guidelines_url} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink size={10} /> View Guidelines
                  </a>
                )}

                {/* Expand assets */}
                <button onClick={() => toggleExpand(k.id)} className="w-full border-t border-border pt-3 text-xs font-medium text-primary hover:underline">
                  {expandedKit === k.id ? "▲ Hide Assets" : "▼ Show Assets"}
                </button>

                {expandedKit === k.id && (
                  <div className="mt-3 space-y-2">
                    {/* Upload button */}
                    <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-primary hover:text-primary">
                      {uploadingForKit === k.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {uploadingForKit === k.id ? "Uploading..." : "Upload Asset"}
                      <input type="file" className="hidden" onChange={(e) => handleUploadAsset(k.id, e)} accept="image/*,video/*,application/pdf" />
                    </label>

                    {/* Assets list */}
                    {(assets[k.id] || []).length === 0 ? (
                      <p className="text-center text-[10px] text-muted">Belum ada assets</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(assets[k.id] || []).map((asset) => {
                          const typeInfo = ASSET_TYPES.find((t) => t.value === asset.type);
                          const AssetIcon = typeInfo?.icon || FileText;
                          return (
                            <div key={asset.id} className="flex items-center justify-between gap-2 rounded-md bg-background p-2">
                              <div className="flex flex-1 items-center gap-2 overflow-hidden">
                                <AssetIcon size={14} className="shrink-0 text-muted" />
                                <div className="overflow-hidden">
                                  <p className="truncate text-xs font-medium text-foreground">{asset.name}</p>
                                  <p className="text-[9px] text-muted">{asset.mime_type || typeInfo?.label}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <a href={asset.file_url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted hover:text-primary">
                                  <ExternalLink size={12} />
                                </a>
                                <button onClick={() => handleDeleteAsset(asset.id, k.id)} className="rounded p-1 text-muted hover:text-danger">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-bold text-foreground">{editingId ? "Edit Brand Kit" : "New Brand Kit"}</h2>
              <button onClick={() => setShowModal(false)} className="rounded p-1.5 text-muted hover:bg-background hover:text-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Name <span className="text-danger">*</span></label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input py-2 text-sm" placeholder="Brand ABC" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Client</label>
                  <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className="input py-2 text-sm">
                    <option value="">— No Client —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Description</label>
                  <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input py-2 text-sm" placeholder="Brand guidelines for..." />
                </div>

                {/* Colors */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border" />
                    <input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="input py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border" />
                    <input value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="input py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.accent_color || "#FFFFFF"} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border" />
                    <input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} className="input py-2 text-sm" placeholder="Optional" />
                  </div>
                </div>

                {/* Fonts */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Primary Font</label>
                  <input value={form.font_primary} onChange={(e) => setForm({ ...form, font_primary: e.target.value })} className="input py-2 text-sm" placeholder="Poppins" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Secondary Font</label>
                  <input value={form.font_secondary} onChange={(e) => setForm({ ...form, font_secondary: e.target.value })} className="input py-2 text-sm" placeholder="Inter" />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Brand Voice</label>
                  <input value={form.brand_voice} onChange={(e) => setForm({ ...form, brand_voice: e.target.value })} className="input py-2 text-sm" placeholder="Professional, Friendly, Bold" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted">Guidelines URL</label>
                  <input value={form.guidelines_url} onChange={(e) => setForm({ ...form, guidelines_url: e.target.value })} className="input py-2 text-sm" placeholder="https://..." />
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Brand Kit?"
        message={`Yakin ingin menghapus "${deleteTarget?.name}"? Semua assets akan ikut terhapus.`}
        confirmText="Hapus"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}