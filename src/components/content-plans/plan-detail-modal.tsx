/**
 * Plan Detail Modal — dengan UX improvements:
 * 1. View mode: konten panjang ("Slide N: ...") di-render sebagai accordion per-slide
 * 2. View mode: teks panjang di-clamp dengan tombol "Lihat selengkapnya"
 * 3. Edit mode: Pilar = multi-select chips (data sheet sering multi-value, mis. "Education, Emotional/Pain Point")
 * 4. Edit mode: Konten = case-insensitive match + dukung nilai custom
 * 5. Edit mode: textarea auto-grow + char counter (brief bisa 1000+ karakter)
 */
"use client";

import { Modal } from "@/components/ui/modal";
import { RichText } from "@/components/ui/rich-text";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { syncTaskForPlan, toastSyncResult } from "@/lib/content-plan-sync";
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
  ChevronDown,
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
  tema: string | null;
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

const PROGRESS_OPTIONS = ["Draft", "Proses Edit", "Done", "Cancel"];

// ── Progress Badge Colors ─────────────────────────────────
const progressColors: Record<string, string> = {
  draft: "bg-muted/20 text-muted",
  done: "bg-success/20 text-success",
  proses_edit: "bg-warning/20 text-warning",
  cancel: "bg-danger/20 text-danger",
};

const progressLabels: Record<string, string> = {
  draft: "Draft",
  done: "Done",
  proses_edit: "Proses Edit",
  cancel: "Cancel",
};

function getProgressKey(value: string | null): string {
  if (!value) return "draft";
  const lower = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (["done", "selesai", "wrapped", "terpublish", "published"].includes(lower)) return "done";
  if (["cancel", "cancelled", "canceled", "dibatalkan"].includes(lower)) return "cancel";
  if (["proses_edit", "editing", "on_edit"].includes(lower)) return "proses_edit";
  if (["draft", "idea", "planning", "rencana"].includes(lower)) return "draft";
  return lower;
}

// ── Parse "Slide N: ..." menjadi segmen ────────────────────
interface SlideSegment {
  num: string;
  body: string;
}

function parseSlides(text: string): { intro: string | null; items: SlideSegment[] } | null {
  const regex = /\bslide\s*(\d+)\s*[:.]/gi;
  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) matches.push(m);
  if (matches.length < 2) return null;
  const intro = text.slice(0, matches[0].index ?? 0).trim();
  const items = matches.map((m, i) => ({
    num: m[1],
    body: text
      .slice(m.index + m[0].length, i + 1 < matches.length ? matches[i + 1].index : text.length)
      .trim(),
  }));
  return { intro: intro || null, items };
}

// ── Expandable Text (clamp + "Lihat selengkapnya") ─────────
function ExpandableText({ text, clampPx = 130 }: { text: string; clampPx?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > clampPx + 8);
  }, [text, clampPx]);

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div
        ref={ref}
        style={!expanded ? { maxHeight: clampPx, overflow: "hidden" } : undefined}
        className="break-words text-sm text-muted"
      >
        <RichText text={text} />
      </div>
      {overflowing && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
          {expanded ? "Sembunyikan" : "Lihat selengkapnya"}
        </button>
      )}
    </div>
  );
}

// ── Slide Breakdown (accordion per slide) ──────────────────
function SlideBreakdown({ text }: { text: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const parsed = useMemo(() => parseSlides(text), [text]);

  if (!parsed) return <ExpandableText text={text} />;

  return (
    <div data-slide className="space-y-2">
      {parsed.intro && <ExpandableText text={parsed.intro} clampPx={80} />}
      {parsed.items.map((s, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border bg-background">
          <button
            type="button"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface"
          >
            <span className="shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              Slide {s.num}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">
              {s.body.split("\n").find((l) => l.trim()) || "—"}
            </span>
            <ChevronDown
              size={14}
              className={cn("shrink-0 text-muted transition-transform", openIdx === i && "rotate-180")}
            />
          </button>
          {openIdx === i && (
            <div className="border-t border-border px-3 py-2.5">
              <p className="whitespace-pre-wrap break-words text-sm text-muted">{s.body}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(s.body);
                  toast.success(`Slide ${s.num} disalin!`);
                }}
                className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CopyIcon size={10} /> Copy slide ini
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Helpers toolbar format (B/I/bullet) — sama seperti form New Plan =====
function applyWrap(el: HTMLTextAreaElement, wrap: string, setVal: (v: string) => void) {
  const { selectionStart: s, selectionEnd: e, value } = el;
  const sel = value.slice(s, e) || "teks";
  const next = value.slice(0, s) + wrap + sel + wrap + value.slice(e);
  setVal(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(s + wrap.length, s + wrap.length + sel.length);
  });
}

function applyBullet(el: HTMLTextAreaElement, setVal: (v: string) => void) {
  const { selectionStart: s, value } = el;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const next = value.slice(0, lineStart) + "- " + value.slice(lineStart);
  setVal(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(s + 2, s + 2);
  });
}

// ── Auto-grow Textarea + char counter ──────────────────────
function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  maxPx = 340,
  textareaId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxPx?: number;
  textareaId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxPx) + "px";
  }, [value, maxPx]);

  return (
    <div>
      <textarea
        ref={ref}
        id={textareaId}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input resize-y overflow-y-auto"
      />
      {value.length > 200 && (
        <p className="mt-1 text-right text-xs text-muted">{value.length} karakter</p>
      )}
    </div>
  );
}

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
    progress: plan.progress || "Draft",
  });

  // ── Pilar multi-select (data sheet sering multi-value) ──
  const selectedPilars = useMemo(
    () =>
      editForm.pilar
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [editForm.pilar]
  );

  const pilarChoices = useMemo(() => {
    const extras = selectedPilars.filter(
      (p) => !PILAR_OPTIONS.some((o) => o.toLowerCase() === p.toLowerCase())
    );
    return [...PILAR_OPTIONS, ...extras];
  }, [selectedPilars]);

  function togglePilar(p: string) {
    const exists = selectedPilars.find((x) => x.toLowerCase() === p.toLowerCase());
    const next = exists
      ? selectedPilars.filter((x) => x.toLowerCase() !== p.toLowerCase())
      : [...selectedPilars, p];
    setEditForm({ ...editForm, pilar: next.join(", ") });
  }

  // ── Konten: case-insensitive match + nilai custom ──
  const kontenChoices = useMemo(() => {
    const v = editForm.konten.trim();
    const canonical = KONTEN_OPTIONS.find((k) => k.toLowerCase() === v.toLowerCase());
    if (v && !canonical) return [v, ...KONTEN_OPTIONS];
    return KONTEN_OPTIONS;
  }, [editForm.konten]);

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
          progress: getProgressKey(editForm.progress),
        } as never)
        .eq("id", plan.id);

      if (error) throw error;

      // Workflow sync: proses_edit → buat/reopen task editor; done/cancel →
      // selesaikan/hold task; draft → reopen. (src/lib/content-plan-sync.ts)
      const newKey = getProgressKey(editForm.progress);
      const syncRes = await syncTaskForPlan(
        supabase,
        {
          id: plan.id,
          client_id: plan.client_id || "",
          client_name: plan.client?.name,
          pilar: editForm.pilar,
          konten: editForm.konten,
          tema: plan.tema,
          details: editForm.details,
          reference: editForm.reference,
          tanggal_upload: editForm.tanggal_upload || null,
        },
        newKey
      );
      toastSyncResult(syncRes, toast);

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
    <Modal
      open
      onClose={onClose}
      size="lg"
      scrollable
      header={
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
      }
    >

        {/* ── Content ────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {isEditing ? (
            /* ==================== EDIT MODE ==================== */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Pilar: multi-select chips */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Pilar <span className="text-xs font-normal text-muted">(bisa pilih lebih dari satu)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {pilarChoices.map((p) => {
                    const active = selectedPilars.some((x) => x.toLowerCase() === p.toLowerCase());
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePilar(p)}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                          active
                            ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                            : "bg-background text-muted hover:text-foreground"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                {selectedPilars.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">Tersimpan sebagai: {selectedPilars.join(", ")}</p>
                )}
              </div>

              {/* Konten */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Konten</label>
                <select
                  value={editForm.konten}
                  onChange={(e) => setEditForm({ ...editForm, konten: e.target.value })}
                  className="input"
                >
                  <option value="">— Pilih Konten —</option>
                  {kontenChoices.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              {/* Copy */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium text-foreground">Copy</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Bold (**teks**)"
                      onClick={() => {
                        const ta = document.getElementById("edit-copy-textarea") as HTMLTextAreaElement | null;
                        if (ta) applyWrap(ta, "**", (v) => setEditForm((f) => ({ ...f, copy: v })));
                      }}
                      className="h-6 w-7 rounded border border-border bg-background text-xs font-bold hover:bg-muted"
                    >
                      B
                    </button>
                    <button
                      type="button"
                      title="Italic (*teks*)"
                      onClick={() => {
                        const ta = document.getElementById("edit-copy-textarea") as HTMLTextAreaElement | null;
                        if (ta) applyWrap(ta, "*", (v) => setEditForm((f) => ({ ...f, copy: v })));
                      }}
                      className="h-6 w-7 rounded border border-border bg-background text-xs italic hover:bg-muted"
                    >
                      I
                    </button>
                    <button
                      type="button"
                      title="Bullet list"
                      onClick={() => {
                        const ta = document.getElementById("edit-copy-textarea") as HTMLTextAreaElement | null;
                        if (ta) applyBullet(ta, (v) => setEditForm((f) => ({ ...f, copy: v })));
                      }}
                      className="h-6 w-7 rounded border border-border bg-background text-xs hover:bg-muted"
                    >
                      •
                    </button>
                  </div>
                </div>
                <AutoGrowTextarea
                  value={editForm.copy}
                  onChange={(v) => setEditForm({ ...editForm, copy: v })}
                  placeholder="Copy / headline konten..."
                  textareaId="edit-copy-textarea"
                />
              </div>

              {/* Details */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Details</label>
                <AutoGrowTextarea
                  value={editForm.details}
                  onChange={(v) => setEditForm({ ...editForm, details: v })}
                  placeholder="Detail konten, brief, atau instruksi..."
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
                <AutoGrowTextarea
                  value={editForm.caption}
                  onChange={(v) => setEditForm({ ...editForm, caption: v })}
                  placeholder="Caption untuk konten..."
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
                <div className="min-w-0">
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Tag size={11} /> Pilar
                  </p>
                  <p className="mt-0.5 break-words text-sm font-medium text-foreground">{plan.pilar || "—"}</p>
                </div>
                <div className="min-w-0">
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
                  <ExpandableText text={plan.copy} clampPx={100} />
                </div>
              )}

              {/* Details — accordion per slide jika format "Slide N: ..." */}
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
                  <SlideBreakdown text={plan.details} />
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
                  <ExpandableText text={plan.caption} clampPx={100} />
                </div>
              )}

              {/* Links */}
              {(plan.reference || plan.link_hasil) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {plan.reference && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40">
                      <Link2 size={16} className="shrink-0 text-primary" />
                      <a
                        href={plan.reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-1"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-muted">Reference</p>
                          <p className="truncate text-sm font-medium text-primary hover:underline">
                            {plan.reference}
                          </p>
                        </div>
                        <ExternalLink size={12} className="ml-auto shrink-0 text-muted" />
                      </a>
                      <button
                        onClick={() => copyText(plan.reference, "Reference")}
                        className="shrink-0 rounded p-1 text-muted hover:bg-surface hover:text-primary"
                        title="Copy Reference"
                      >
                        <CopyIcon size={12} />
                      </button>
                    </div>
                  )}
                  {plan.link_hasil && (
                    <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-3 transition-colors hover:border-success/40">
                      <Link2 size={16} className="shrink-0 text-success" />
                      <a
                        href={plan.link_hasil}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-1"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-muted">Link Hasil</p>
                          <p className="truncate text-sm font-medium text-success hover:underline">
                            {plan.link_hasil}
                          </p>
                        </div>
                        <ExternalLink size={12} className="ml-auto shrink-0 text-muted" />
                      </a>
                      <button
                        onClick={() => copyText(plan.link_hasil, "Link Hasil")}
                        className="shrink-0 rounded p-1 text-muted hover:bg-surface hover:text-success"
                        title="Copy Link Hasil"
                      >
                        <CopyIcon size={12} />
                      </button>
                    </div>
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
    </Modal>
  );
}