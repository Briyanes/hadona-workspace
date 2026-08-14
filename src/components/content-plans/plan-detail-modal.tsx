"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Edit3,
  Trash2,
  ExternalLink,
  Calendar,
  FileText,
  Link2,
  Loader2,
  Copy as CopyIcon,
  AlignLeft,
  Image as ImageIcon,
  Tag,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────
interface ContentPlan {
  id: string;
  client_id: string;
  month: string;
  plan_url: string | null;
  services: string[];
  notes: string | null;
  created_at: string;
  client?: { name: string };
  pilar: string | null;
  konten: string | null;
  copy: string | null;
  details: string | null;
  reference: string | null;
  caption: string | null;
  link_hasil: string | null;
  tanggal_upload: string | null;
  progress: string | null;
}

// ── Dropdown Options ──────────────────────────────────────
const PILAR_OPTIONS = [
  "Education",
  "Awareness",
  "Product Highlight",
  "UGC/RTW",
  "Before-After",
  "USP/UVP",
  "Emotional/Pain Point",
  "Social Proof",
  "Conversion",
  "Product Launch",
];

const KONTEN_OPTIONS = ["Reels", "Single Image", "Carousel", "Mix Type"];

const PROGRESS_OPTIONS = ["Done", "Proses Edit", "Cancel"];

// ── Progress Badge Colors ─────────────────────────────────
const progressColors: Record<string, string> = {
  done: "bg-success/20 text-success",
  proses_edit: "bg-warning/20 text-warning",
  cancel: "bg-danger/20 text-danger",
};

const progressLabels: Record<string, string> = {
  done: "Done",
  proses_edit: "Proses Edit",
  cancel: "Cancel",
};

function getProgressKey(value: string | null): string {
  if (!value) return "proses_edit";
  return value.toLowerCase().replace(/\s+/g, "_");
}

// ── Empty Edit Form ───────────────────────────────────────
const emptyEditForm = {
  pilar: "",
  konten: "",
  copy: "",
  details: "",
  reference: "",
  caption: "",
  link_hasil: "",
  tanggal_upload: "",
  progress: "Proses Edit",
};

interface PlanDetailModalProps {
  plan: ContentPlan;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function PlanDetailModal({ plan, onClose, onUpdated, onDeleted }: PlanDetailModalProps) {
  const supabase = createClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Copy helper ──
  function copyText(text: string | null, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(label + " disalin!");
  }

  function copyAll() {
    const parts: string[] = [];
    if (plan.copy) parts.push(plan.copy);
    if (plan.details) parts.push(plan.details);
    if (plan.caption) parts.push(plan.caption);
    if (parts.length === 0) return;
    navigator.clipboard.writeText(parts.join("\n\n"));
    toast.success("Semua teks disalin!");
  }
  const [editForm, setEditForm] = useState({
    pilar: plan.pilar || "",
    konten: plan.konten || "",
    copy: plan.copy || "",
    details: plan.details || "",
    reference: plan.reference || "",
    caption: plan.caption || "",
    link_hasil: plan.link_hasil || "",
    tanggal_upload: plan.tanggal_upload || "",
    progress: plan.progress || "Proses Edit",
  });

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("content_plans")
        .update({
          pilar: editForm.pilar || null,
          konten: editForm.konten || null,
          copy: editForm.copy.trim() || null,
          details: editForm.details.trim() || null,
          reference: editForm.reference.trim() || null,
          caption: editForm.caption.trim() || null,
          link_hasil: editForm.link_hasil.trim() || null,
          tanggal_upload: editForm.tanggal_upload || null,
          progress: editForm.progress,
        } as never)
        .eq("id", plan.id);

      if (error) throw error;

      toast.success("Content plan diupdate!");
      setIsEditing(false);
      onUpdated();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || "Unknown error";
      console.error("Save plan error:", err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      const { error } = await supabase.from("content_plans").delete().eq("id", plan.id);
      if (error) throw error;
      toast.success("Plan dihapus");
      onDeleted();
      onClose();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || "Unknown error";
      console.error("Delete plan error:", err);
      toast.error("Gagal hapus: " + msg);
      setConfirmDelete(false);
    }
  }

  const pKey = getProgressKey(plan.progress);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-4">
      <div className="relative my-0 flex min-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border-border bg-surface shadow-xl sm:my-4 sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:border">
        {/* ── Sticky Header ──────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">
              {isEditing ? "Edit Content Plan" : "Detail Content Plan"}
            </h2>
            {!isEditing && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", progressColors[pKey])}>
                {progressLabels[pKey] || plan.progress || "Proses Edit"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded p-2 text-muted hover:bg-background hover:text-primary"
                  title="Edit"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={handleDelete}
                  className={cn(
                    "rounded p-2 hover:bg-background",
                    confirmDelete ? "text-danger" : "text-muted hover:text-danger"
                  )}
                  title="Hapus"
                >
                  <Trash2 size={16} />
                </button>
                {confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded px-2 py-1 text-xs text-muted hover:text-foreground"
                  >
                    Batal
                  </button>
                )}
              </>
            )}
            <button
              onClick={onClose}
              className="rounded p-2 text-muted hover:bg-background hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Content ────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {isEditing ? (
            /* ==================== EDIT MODE ==================== */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Pilar + Konten */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Pilar</label>
                  <select
                    value={editForm.pilar}
                    onChange={(e) => setEditForm({ ...editForm, pilar: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih Pilar —</option>
                    {PILAR_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Konten</label>
                  <select
                    value={editForm.konten}
                    onChange={(e) => setEditForm({ ...editForm, konten: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih Konten —</option>
                    {KONTEN_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Copy */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Copy</label>
                <input
                  type="text"
                  value={editForm.copy}
                  onChange={(e) => setEditForm({ ...editForm, copy: e.target.value })}
                  placeholder="Copy / headline konten..."
                  className="input"
                />
              </div>

              {/* Details */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Details</label>
                <textarea
                  rows={2}
                  value={editForm.details}
                  onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                  placeholder="Detail konten, brief, atau instruksi..."
                  className="input resize-none"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Reference</label>
                <input
                  type="text"
                  value={editForm.reference}
                  onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                  placeholder="URL atau referensi konten..."
                  className="input"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Caption</label>
                <textarea
                  rows={3}
                  value={editForm.caption}
                  onChange={(e) => setEditForm({ ...editForm, caption: e.target.value })}
                  placeholder="Caption untuk konten..."
                  className="input resize-none"
                />
              </div>

              {/* Link Hasil + Tgl Upload */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Link Hasil</label>
                  <input
                    type="url"
                    value={editForm.link_hasil}
                    onChange={(e) => setEditForm({ ...editForm, link_hasil: e.target.value })}
                    placeholder="https://..."
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Tanggal Upload</label>
                  <input
                    type="date"
                    value={editForm.tanggal_upload}
                    onChange={(e) => setEditForm({ ...editForm, tanggal_upload: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {/* Progress */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Progress</label>
                <div className="flex gap-2">
                  {PROGRESS_OPTIONS.map((opt) => {
                    const key = opt.toLowerCase().replace(/\s+/g, "_");
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, progress: opt })}
                        className={cn(
                          "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          editForm.progress === opt
                            ? cn(progressColors[key], "ring-2 ring-offset-1 ring-offset-surface")
                            : "bg-background text-muted hover:text-foreground"
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save / Cancel */}
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    "Simpan Perubahan"
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* ==================== VIEW MODE ==================== */
            <div className="space-y-5">
              {/* Title & Client */}
              <div>
                <h3 className="text-xl font-bold text-foreground">{plan.client?.name || "Unknown Client"}</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {formatDate(plan.month + "-01", { month: "long", year: "numeric" })}
                </p>
              </div>

              {/* Meta Info Grid */}
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Tag size={11} /> Pilar
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{plan.pilar || "—"}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <ImageIcon size={11} /> Konten
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{plan.konten || "—"}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Calendar size={11} /> Tgl Upload
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {plan.tanggal_upload ? formatDate(plan.tanggal_upload) : "—"}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <FileText size={11} /> Progress
                  </p>
                  <p className={cn("mt-0.5 text-sm font-medium", progressColors[pKey]?.split(" ")[1] || "text-warning")}>
                    {progressLabels[pKey] || plan.progress || "Proses Edit"}
                  </p>
                </div>
              </div>

              {/* Copy All Button */}
              {(plan.copy || plan.details || plan.caption) && (
                <button
                  onClick={copyAll}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <CopyIcon size={14} /> Copy Semua Teks
                </button>
              )}

              {/* Copy */}
              {plan.copy && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
                      <CopyIcon size={11} /> Copy
                    </p>
                    <button
                      onClick={() => copyText(plan.copy, "Copy")}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                    >
                      <CopyIcon size={10} /> Copy
                    </button>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="whitespace-pre-wrap text-sm text-muted">{plan.copy}</p>
                  </div>
                </div>
              )}

              {/* Details */}
              {plan.details && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
                      <AlignLeft size={11} /> Details
                    </p>
                    <button
                      onClick={() => copyText(plan.details, "Details")}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                    >
                      <CopyIcon size={10} /> Copy
                    </button>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="whitespace-pre-wrap text-sm text-muted">{plan.details}</p>
                  </div>
                </div>
              )}

              {/* Caption */}
              {plan.caption && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted">
                      <FileText size={11} /> Caption
                    </p>
                    <button
                      onClick={() => copyText(plan.caption, "Caption")}
                      className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                    >
                      <CopyIcon size={10} /> Copy
                    </button>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="whitespace-pre-wrap text-sm text-muted">{plan.caption}</p>
                  </div>
                </div>
              )}

              {/* Links */}
              {(plan.reference || plan.link_hasil) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {plan.reference && (
                    <a
                      href={plan.reference}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <Link2 size={16} className="shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted">Reference</p>
                        <p className="truncate text-sm font-medium text-primary">{plan.reference}</p>
                      </div>
                      <ExternalLink size={12} className="ml-auto shrink-0 text-muted" />
                    </a>
                  )}
                  {plan.link_hasil && (
                    <a
                      href={plan.link_hasil}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-3 transition-colors hover:border-success/40 hover:bg-success/10"
                    >
                      <Link2 size={16} className="shrink-0 text-success" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted">Link Hasil</p>
                        <p className="truncate text-sm font-medium text-success">{plan.link_hasil}</p>
                      </div>
                      <ExternalLink size={12} className="ml-auto shrink-0 text-muted" />
                    </a>
                  )}
                </div>
              )}

              {/* Empty state if no content */}
              {!plan.copy && !plan.details && !plan.caption && !plan.reference && !plan.link_hasil && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <FileText size={24} className="mx-auto mb-2 text-muted" />
                  <p className="text-sm text-muted">Belum ada detail konten. Klik Edit untuk menambahkan.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}