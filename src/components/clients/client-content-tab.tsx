// @ts-nocheck — table content_uploads & caption_bank belum ada di generated types
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  FileText,
  Tag,
  ExternalLink,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  MessageSquare,
} from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──
interface ContentUpload {
  id: string;
  upload_date: string | null;
  division: string | null;
  brief_no: string | null;
  caption: string | null;
  content_link: string | null;
  status: string;
  notes: string | null;
}

interface CaptionItem {
  id: string;
  product: string | null;
  theme: string | null;
  headline: string | null;
  caption: string | null;
  hashtags: string | null;
  performance: string;
}

type SubTab = "uploads" | "captions";

const uploadStatusColors: Record<string, string> = {
  todo: "bg-surface text-muted",
  "in-progress": "bg-warning/20 text-warning",
  done: "bg-success/20 text-success",
};

const performanceColors: Record<string, string> = {
  untested: "bg-surface text-muted",
  good: "bg-success/20 text-success",
  poor: "bg-danger/20 text-danger",
};

export function ClientContentTab({ clientId }: { clientId: string }) {
  // eslint-disable-next-line
  const supabase = createClient() as any;
  const [uploads, setUploads] = useState<ContentUpload[]>([]);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>("uploads");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showCaptionForm, setShowCaptionForm] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    division: "Social Media Management",
    brief_no: "",
    caption: "",
    content_link: "",
    notes: "",
    status: "todo" as "todo" | "in-progress" | "done",
  });

  const [captionForm, setCaptionForm] = useState({
    product: "",
    theme: "",
    headline: "",
    caption: "",
    hashtags: "",
    performance: "untested" as "untested" | "good" | "poor",
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadData() {
    try {
      const [uploadsRes, captionsRes] = await Promise.all([
        supabase
          .from("content_uploads")
          .select("id, upload_date, division, brief_no, caption, content_link, status, notes")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("caption_bank")
          .select("id, product, theme, headline, caption, hashtags, performance")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ]);

      setUploads(uploadsRes.data || []);
      setCaptions(captionsRes.data || []);
    } catch {
      toast.error("Gagal memuat data content");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUpload() {
    if (!uploadForm.caption.trim()) {
      toast.error("Caption wajib diisi");
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Sesi berakhir, silakan login ulang");
        return;
      }

      const { error } = await supabase.from("content_uploads").insert({
        client_id: clientId,
        division: uploadForm.division,
        brief_no: uploadForm.brief_no || null,
        caption: uploadForm.caption,
        content_link: uploadForm.content_link || null,
        notes: uploadForm.notes || null,
        status: uploadForm.status,
        created_by: userData.user.id,
      });

      if (error) throw error;

      toast.success("Content upload ditambahkan");
      setShowUploadForm(false);
      setUploadForm({
        division: "Social Media Management",
        brief_no: "",
        caption: "",
        content_link: "",
        notes: "",
        status: "todo",
      });
      loadData();
    } catch (err) {
      toast.error("Gagal menambah: " + (err instanceof Error ? err.message : "Unknown"));
    }
  }

  async function handleAddCaption() {
    if (!captionForm.caption.trim()) {
      toast.error("Caption wajib diisi");
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error("Sesi berakhir, silakan login ulang");
        return;
      }

      const { error } = await supabase.from("caption_bank").insert({
        client_id: clientId,
        product: captionForm.product || null,
        theme: captionForm.theme || null,
        headline: captionForm.headline || null,
        caption: captionForm.caption,
        hashtags: captionForm.hashtags || null,
        performance: captionForm.performance,
        created_by: userData.user.id,
      });

      if (error) throw error;

      toast.success("Caption ditambahkan ke bank");
      setShowCaptionForm(false);
      setCaptionForm({
        product: "",
        theme: "",
        headline: "",
        caption: "",
        hashtags: "",
        performance: "untested",
      });
      loadData();
    } catch (err) {
      toast.error("Gagal menambah: " + (err instanceof Error ? err.message : "Unknown"));
    }
  }

  async function handleUpdateUploadStatus(id: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from("content_uploads")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      toast.success("Status diperbarui");
      loadData();
    } catch {
      toast.error("Gagal update status");
    }
  }

  async function handleUpdateCaptionPerformance(id: string, newPerf: string) {
    try {
      const { error } = await supabase
        .from("caption_bank")
        .update({ performance: newPerf })
        .eq("id", id);
      if (error) throw error;
      toast.success("Performance diperbarui");
      loadData();
    } catch {
      toast.error("Gagal update performance");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 rounded" />
        <div className="skeleton h-32 rounded-lg" />
      </div>
    );
  }

  // Stats
  const doneUploads = uploads.filter((u) => u.status === "done").length;
  const inProgressUploads = uploads.filter((u) => u.status === "in-progress").length;
  const todoUploads = uploads.filter((u) => u.status === "todo").length;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="card flex items-center gap-2 p-3">
          <Upload className="text-primary" size={16} />
          <div>
            <p className="text-lg font-bold text-foreground">{uploads.length}</p>
            <p className="text-[10px] text-muted">Total Uploads</p>
          </div>
        </div>
        <div className="card flex items-center gap-2 p-3">
          <Clock className="text-warning" size={16} />
          <div>
            <p className="text-lg font-bold text-foreground">
              {todoUploads + inProgressUploads}
            </p>
            <p className="text-[10px] text-muted">Pending</p>
          </div>
        </div>
        <div className="card flex items-center gap-2 p-3">
          <CheckCircle className="text-success" size={16} />
          <div>
            <p className="text-lg font-bold text-success">{doneUploads}</p>
            <p className="text-[10px] text-muted">Done</p>
          </div>
        </div>
        <div className="card flex items-center gap-2 p-3">
          <Tag className="text-accent" size={16} />
          <div>
            <p className="text-lg font-bold text-foreground">{captions.length}</p>
            <p className="text-[10px] text-muted">Caption Bank</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setSubTab("uploads")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              subTab === "uploads"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <Upload size={14} /> Upload Tracker
            {uploads.length > 0 && (
              <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                {uploads.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setSubTab("captions")}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              subTab === "captions"
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            <FileText size={14} /> Caption Bank
            {captions.length > 0 && (
              <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                {captions.length}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={() => (subTab === "uploads" ? setShowUploadForm(true) : setShowCaptionForm(true))}
          className="btn-primary flex items-center gap-1 text-xs"
        >
          <Plus size={14} /> {subTab === "uploads" ? "Upload" : "Caption"}
        </button>
      </div>

      {/* ── Upload Tracker ── */}
      {subTab === "uploads" && (
        <div className="space-y-2">
          {uploads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Upload className="mb-3 text-muted" size={32} />
              <p className="text-sm text-muted">Belum ada content upload untuk client ini</p>
            </div>
          ) : (
            uploads.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-surface p-3 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.brief_no && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {item.brief_no}
                        </span>
                      )}
                      {item.division && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {item.division}
                        </span>
                      )}
                      {item.upload_date && (
                        <span className="flex items-center gap-1 text-[10px] text-muted">
                          <Calendar size={10} />
                          {formatDate(item.upload_date, { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm text-foreground">{item.caption}</p>
                    {item.content_link && (
                      <a
                        href={item.content_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink size={10} /> Lihat konten
                      </a>
                    )}
                    {item.notes && (
                      <p className="mt-1 text-xs text-muted">📝 {item.notes}</p>
                    )}
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => handleUpdateUploadStatus(item.id, e.target.value)}
                    className={cn(
                      "shrink-0 rounded border-0 px-2 py-1 text-xs font-medium outline-none",
                      uploadStatusColors[item.status] || uploadStatusColors.todo
                    )}
                  >
                    <option value="todo">Todo</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Caption Bank ── */}
      {subTab === "captions" && (
        <div className="space-y-2">
          {captions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="mb-3 text-muted" size={32} />
              <p className="text-sm text-muted">Belum ada caption di bank untuk client ini</p>
            </div>
          ) : (
            captions.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-surface p-3 transition-colors hover:border-accent/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.product && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {item.product}
                        </span>
                      )}
                      {item.theme && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          {item.theme}
                        </span>
                      )}
                    </div>
                    {item.headline && (
                      <p className="mt-1 text-sm font-bold text-foreground">{item.headline}</p>
                    )}
                    <p className="mt-0.5 line-clamp-3 text-sm text-muted">{item.caption}</p>
                    {item.hashtags && (
                      <p className="mt-1 text-xs text-primary">{item.hashtags}</p>
                    )}
                  </div>
                  <select
                    value={item.performance}
                    onChange={(e) => handleUpdateCaptionPerformance(item.id, e.target.value)}
                    className={cn(
                      "shrink-0 rounded border-0 px-2 py-1 text-xs font-medium outline-none",
                      performanceColors[item.performance] || performanceColors.untested
                    )}
                  >
                    <option value="untested">Untested</option>
                    <option value="good">Good</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Add Upload Form Modal ── */}
      {showUploadForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowUploadForm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-bold text-foreground">Tambah Content Upload</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Divisi</label>
                <input
                  type="text"
                  value={uploadForm.division}
                  onChange={(e) => setUploadForm({ ...uploadForm, division: e.target.value })}
                  className="input"
                  placeholder="Social Media Management"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Brief No</label>
                <input
                  type="text"
                  value={uploadForm.brief_no}
                  onChange={(e) => setUploadForm({ ...uploadForm, brief_no: e.target.value })}
                  className="input"
                  placeholder="BRIEF-001"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Caption *</label>
                <textarea
                  value={uploadForm.caption}
                  onChange={(e) => setUploadForm({ ...uploadForm, caption: e.target.value })}
                  className="input min-h-[80px] resize-y"
                  placeholder="Tulis caption di sini..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Content Link</label>
                <input
                  type="url"
                  value={uploadForm.content_link}
                  onChange={(e) => setUploadForm({ ...uploadForm, content_link: e.target.value })}
                  className="input"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Status</label>
                <select
                  value={uploadForm.status}
                  onChange={(e) =>
                    setUploadForm({ ...uploadForm, status: e.target.value as "todo" | "in-progress" | "done" })
                  }
                  className="input"
                >
                  <option value="todo">Todo</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
                <input
                  type="text"
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  className="input"
                  placeholder="Catatan tambahan..."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowUploadForm(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-background"
              >
                Batal
              </button>
              <button onClick={handleAddUpload} className="btn-primary flex-1 text-sm">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Caption Form Modal ── */}
      {showCaptionForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowCaptionForm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-bold text-foreground">Tambah Caption ke Bank</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Product</label>
                  <input
                    type="text"
                    value={captionForm.product}
                    onChange={(e) => setCaptionForm({ ...captionForm, product: e.target.value })}
                    className="input"
                    placeholder="Nama produk"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Theme</label>
                  <input
                    type="text"
                    value={captionForm.theme}
                    onChange={(e) => setCaptionForm({ ...captionForm, theme: e.target.value })}
                    className="input"
                    placeholder="Tema konten"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Headline</label>
                <input
                  type="text"
                  value={captionForm.headline}
                  onChange={(e) => setCaptionForm({ ...captionForm, headline: e.target.value })}
                  className="input"
                  placeholder="Hook / headline..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Caption *</label>
                <textarea
                  value={captionForm.caption}
                  onChange={(e) => setCaptionForm({ ...captionForm, caption: e.target.value })}
                  className="input min-h-[100px] resize-y"
                  placeholder="Tulis caption lengkap..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Hashtags</label>
                <input
                  type="text"
                  value={captionForm.hashtags}
                  onChange={(e) => setCaptionForm({ ...captionForm, hashtags: e.target.value })}
                  className="input"
                  placeholder="#brand #product #promo"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Performance</label>
                <select
                  value={captionForm.performance}
                  onChange={(e) =>
                    setCaptionForm({
                      ...captionForm,
                      performance: e.target.value as "untested" | "good" | "poor",
                    })
                  }
                  className="input"
                >
                  <option value="untested">Untested</option>
                  <option value="good">Good</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCaptionForm(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-background"
              >
                Batal
              </button>
              <button onClick={handleAddCaption} className="btn-primary flex-1 text-sm">
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}