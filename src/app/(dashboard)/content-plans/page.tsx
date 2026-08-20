"use client";

import { RichText } from "@/components/ui/rich-text";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Plus,
  X,
  ExternalLink,
  Trash2,
  Pencil,
  Search,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
  ChevronRight,
  ChevronDown,
  Copy,
  Download,
  LayoutGrid,
  Table as TableIcon,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { PlanDetailModal } from "@/components/content-plans/plan-detail-modal";
import { ImportSheetModal } from "@/components/content-plans/import-sheet-modal";

interface ContentPlan {
  id: string;
  client_id: string;
  month: string;
  plan_url: string | null;
  services: string[];
  notes: string | null;
  status: string;
  created_at: string;
  client?: { name: string };
  // New columns
  pilar: string | null;
  konten: string | null;
  tema: string | null;
  copy: string | null;
  details: string | null;
  reference: string | null;
  caption: string | null;
  thumbnail: string | null;
  link_hasil: string | null;
  tanggal_upload: string | null;
  progress: string | null;
}

interface Client {
  id: string;
  name: string;
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
  // Normalize legacy / sheet labels (Done, Wrapped, Published, etc.)
  if (["done", "selesai", "wrapped", "terpublish", "published"].includes(lower)) return "done";
  if (["cancel", "cancelled", "canceled", "dibatalkan"].includes(lower)) return "cancel";
  if (["proses_edit", "editing", "on_edit"].includes(lower)) return "proses_edit";
  if (["draft", "idea", "planning", "rencana"].includes(lower)) return "draft";
  return lower;
}

// Parse comma-separated pilar (e.g. "Education, Awareness") into trimmed array
function parsePilars(pilar: string | null | undefined): string[] {
  if (!pilar) return [];
  return pilar
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Toggle a pilar option in a comma-separated string (multi-select)
function togglePilarValue(current: string, option: string): string {
  const list = parsePilars(current);
  const idx = list.findIndex((p) => p.toLowerCase() === option.toLowerCase());
  if (idx >= 0) list.splice(idx, 1);
  else list.push(option);
  return list.join(", ");
}

// ── Empty Form ────────────────────────────────────────────
const emptyForm = {
  client_id: "",
  month: "",
  pilar: "",
  konten: "",
  tema: "",
  copy: "",
  details: "",
  reference: "",
  caption: "",
  thumbnail: "",
  link_hasil: "",
  tanggal_upload: "",
  progress: "Draft",
  // Keep old fields for backward compat
  plan_url: "",
  notes: "",
  services: [] as string[],
  status: "draft",
};


// ===== Helpers toolbar format (B/I/bullet) untuk textarea Copy =====
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

export default function ContentPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [progressFilter, setProgressFilter] = useState("all");
  const [pilarFilter, setPilarFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("card");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Detail Modal
  const [selectedPlan, setSelectedPlan] = useState<ContentPlan | null>(null);

  useEffect(() => {
    loadPlans();
    loadClients();
  }, [supabase]);

  // Restore view preference (persisted)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("content-plans-view");
      if (saved === "table" || saved === "card") setViewMode(saved);
    } catch {
      // ignore
    }
  }, []);

  function switchView(v: "table" | "card") {
    setViewMode(v);
    try {
      localStorage.setItem("content-plans-view", v);
    } catch {
      // ignore
    }
  }

  async function loadPlans() {
    try {
      const { data, error } = await supabase
        .from("content_plans")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setPlans((data as unknown as ContentPlan[]) || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as Record<string, unknown>)?.message as string || "Unknown error";
      console.error("Load plans error:", err);
      toast.error("Gagal memuat content plans: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (error) {
      toast.error("Gagal memuat daftar client");
      return;
    }
    setClients((data as unknown as Client[]) || []);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(plan: ContentPlan) {
    setEditingId(plan.id);
    setForm({
      client_id: plan.client_id,
      month: plan.month,
      pilar: plan.pilar || "",
      konten: plan.konten || "",
      tema: plan.tema || "",
      copy: plan.copy || "",
      details: plan.details || "",
      reference: plan.reference || "",
      caption: plan.caption || "",
      thumbnail: plan.thumbnail || "",
      link_hasil: plan.link_hasil || "",
      tanggal_upload: plan.tanggal_upload || "",
      progress: plan.progress || "Draft",
      plan_url: plan.plan_url || "",
      notes: plan.notes || "",
      services: plan.services || [],
      status: plan.status || "draft",
    });
    setShowModal(true);
  }

  function openDetail(plan: ContentPlan) {
    setSelectedPlan(plan);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || !form.month) {
      toast.error("Client dan Bulan wajib diisi");
      return;
    }

    setSaving(true);
    try {
      // Auto-prepend https:// if user forgot protocol (fixes silent type="url" validation block)
      const fixUrl = (u: string): string | null => {
        const t = u.trim();
        if (!t) return null;
        return /^https?:\/\//i.test(t) ? t : "https://" + t;
      };

      const payload = {
        client_id: form.client_id,
        month: form.month,
        pilar: parsePilars(form.pilar).join(", ") || null,
        konten: form.konten || null,
        tema: form.tema.trim() || null,
        copy: form.copy.trim() || null,
        details: form.details.trim() || null,
        reference: fixUrl(form.reference),
        caption: form.caption.trim() || null,
        thumbnail: form.thumbnail.trim() || null,
        link_hasil: fixUrl(form.link_hasil),
        tanggal_upload: form.tanggal_upload || null,
        progress: getProgressKey(form.progress),
        status: form.status || "draft",
        // Keep old fields
        plan_url: fixUrl(form.plan_url),
        notes: form.notes.trim() || null,
        services: form.services,
      };

      // Fallback: strip columns that don't exist in DB yet (pre-migration-v88)
      // PostgREST error: "Could not find the 'tema' column of 'content_plans'..."
      const persist = async (): Promise<{ error: string | null; skipped: string[]; id?: string }> => {
        const current: Record<string, unknown> = { ...payload };
        const skipped: string[] = [];
        for (let i = 0; i <= Object.keys(payload).length; i++) {
          const res = editingId
            ? await supabase.from("content_plans").update(current as never).eq("id", editingId)
            : await supabase.from("content_plans").insert(current as never).select("id");
          if (!res.error) {
            const rows = (res.data as unknown as { id?: string }[]) || [];
            const inserted = !editingId && rows.length > 0 ? rows[0] : null;
            return { error: null, skipped, id: editingId || inserted?.id };
          }
          const m = res.error.message.match(/Could not find the '([^']+)' column/);
          if (m && m[1] in current) {
            skipped.push(m[1]);
            delete current[m[1]];
            continue;
          }
          return { error: res.error.message, skipped };
        }
        return { error: "Gagal menyimpan setelah beberapa percobaan", skipped };
      };

      const { error: saveError, skipped, id: savedId } = await persist();
      if (saveError) throw new Error(saveError);
      toast.success(editingId ? "Content plan diupdate!" : "Content plan dibuat!");
      if (skipped.length > 0) {
        toast.warning(
          `Tersimpan, tapi kolom "${skipped.join(", ")}" dilewati (belum ada di database). Jalankan supabase/migration-v88.sql di Supabase SQL Editor agar tersimpan penuh.`
        );
      }

      // Workflow trigger: Proses Edit = buat task editor; Done = selesaikan task
      const newKey = getProgressKey(form.progress);
      const clientName = clients.find((c) => c.id === form.client_id)?.name;
      const oldPlan = editingId ? plans.find((p) => p.id === editingId) : null;
      if (newKey === "proses_edit") {
        await syncTaskForPlan(
          {
            id: editingId || savedId || "",
            client_id: form.client_id,
            client_name: clientName,
            pilar: payload.pilar,
            konten: payload.konten,
            tema: payload.tema,
            details: payload.details,
            reference: payload.reference,
            tanggal_upload: payload.tanggal_upload,
          },
          newKey
        );
      } else if (oldPlan) {
        await syncTaskForPlan(
          {
            id: oldPlan.id,
            client_id: oldPlan.client_id,
            client_name: oldPlan.client?.name,
            pilar: oldPlan.pilar,
            konten: oldPlan.konten,
            tema: oldPlan.tema,
            details: oldPlan.details,
            reference: oldPlan.reference,
            tanggal_upload: oldPlan.tanggal_upload,
          },
          newKey
        );
      }

      setForm(emptyForm);
      setEditingId(null);
      setShowModal(false);
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as Record<string, unknown>)?.message as string || "Unknown error";
      console.error("Save plan error:", err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus content plan ini?")) return;
    try {
      const { error } = await supabase.from("content_plans").delete().eq("id", id);
      if (error) throw error;
      toast.success("Plan dihapus");
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || "Unknown error";
      console.error("Delete plan error:", err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  // ── Quick inline progress update ─────────────────────────
  async function quickUpdateProgress(plan: ContentPlan, progress: string) {
    const key = getProgressKey(progress);
    try {
      const { error } = await supabase
        .from("content_plans")
        .update({ progress: key } as never)
        .eq("id", plan.id);
      if (error) throw error;
      toast.success("Progress diperbarui");
      // Workflow: Proses Edit → buat task editor; Done → selesaikan task
      await syncTaskForPlan(plan, key);
      loadPlans();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message || "Unknown error";
      console.error("Quick update error:", err);
      toast.error("Gagal update progress: " + msg);
    }
  }

  // ── Workflow trigger: sinkronisasi plan → Task Manager ──
  // Proses Edit → buat task editor (division: Editor — antrean kerja tim Editor)
  // Done → task editor ikut selesai
  async function syncTaskForPlan(
    plan: {
      id: string;
      client_id: string;
      client_name?: string;
      pilar?: string | null;
      konten?: string | null;
      tema?: string | null;
      details?: string | null;
      reference?: string | null;
      tanggal_upload?: string | null;
    },
    newKey: string
  ) {
    try {
      if (!plan.id) return;
      // Link plan ↔ task via tasks.sheet_row_id (kolom sudah ada — tanpa migration)
      const linkKey = `content_plan:${plan.id}`;
      if (newKey === "proses_edit") {
        // Hindari duplikat task editor untuk plan yang sama
        const { data: existing } = await supabase
          .from("tasks")
          .select("id")
          .eq("sheet_row_id", linkKey)
          .limit(1)
          .maybeSingle();
        if (existing) return;
        const { data: userData } = await supabase.auth.getUser();
        const descParts: string[] = [];
        if (plan.pilar) descParts.push(`Pilar: ${plan.pilar}`);
        if (plan.konten) descParts.push(`Konten: ${plan.konten}`);
        if (plan.tema) descParts.push(`Tema: ${plan.tema}`);
        if (plan.details) descParts.push("", "Details:", plan.details);
        if (plan.reference) descParts.push("", `Reference: ${plan.reference}`);
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            title: `[Content] ${plan.client_name || "Client"} — ${plan.tema || plan.konten || "Content Plan"}`,
            description: descParts.join("\n") || null,
            client_id: plan.client_id || null,
            priority: "medium",
            status: "todo",
            division: "Editor",
            due_date: plan.tanggal_upload || null,
            created_by: userData.user?.id,
            sheet_row_id: linkKey,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        if (task) toast.success("Task editor dibuat di Task Manager (divisi Editor)");
      } else if (newKey === "done") {
        const { error } = await supabase
          .from("tasks")
          .update({ status: "done" } as never)
          .eq("sheet_row_id", linkKey);
        if (!error) toast.success("Task editor ditandai selesai");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Sync task error:", err);
      toast.warning("Plan tersimpan, tapi sinkronisasi task editor gagal: " + msg);
    }
  }

  // ── Copy helper (sama seperti Content Studio CaptionBank) ──
  function copyText(text: string | null, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(label + " disalin!");
  }

  function copyAll(plan: ContentPlan) {
    const parts: string[] = [];
    if (plan.copy) parts.push(plan.copy);
    if (plan.details) parts.push(plan.details);
    if (plan.caption) parts.push(plan.caption);
    if (parts.length === 0) return;
    navigator.clipboard.writeText(parts.join("\n\n"));
    toast.success("Semua teks disalin!");
  }

  // ── Filter Logic ─────────────────────────────────────────
  const monthName = (m: string, withYear = false) =>
    new Intl.DateTimeFormat(
      "id-ID",
      withYear ? { month: "long", year: "numeric" } : { month: "long" }
    ).format(new Date(m + "-01T00:00:00"));
  const monthOptions = Array.from(new Set(plans.map((pl) => pl.month).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const filtered = plans.filter((p) => {
    const matchSearch =
      !search ||
      p.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.copy?.toLowerCase().includes(search.toLowerCase()) ||
      p.details?.toLowerCase().includes(search.toLowerCase()) ||
      p.caption?.toLowerCase().includes(search.toLowerCase()) ||
      p.pilar?.toLowerCase().includes(search.toLowerCase()) ||
      p.tema?.toLowerCase().includes(search.toLowerCase()) ||
      p.month.includes(search);
    const pKey = getProgressKey(p.progress);
    const matchProgress = progressFilter === "all" || pKey === progressFilter;
    const matchPilar =
      pilarFilter === "all" ||
      parsePilars(p.pilar).some((pl) => pl.toLowerCase() === pilarFilter.toLowerCase());
    const matchClient = clientFilter === "all" || p.client_id === clientFilter;
    const matchMonth = monthFilter === "all" || p.month === monthFilter;
    return matchSearch && matchProgress && matchPilar && matchClient && matchMonth;
  });

  // ── Stats ────────────────────────────────────────────────
  const totalPlans = plans.length;
  const doneCount = plans.filter((p) => getProgressKey(p.progress) === "done").length;
  const prosesCount = plans.filter((p) => getProgressKey(p.progress) === "proses_edit").length;
  const cancelCount = plans.filter((p) => getProgressKey(p.progress) === "cancel").length;
  const draftCount = plans.filter((p) => getProgressKey(p.progress) === "draft").length;

  const statCards = [
    { label: "Total Plans", value: totalPlans, icon: CalendarDays, color: "text-primary", bg: "bg-primary/10" },
    { label: "Draft", value: draftCount, icon: FileText, color: "text-muted", bg: "bg-muted/10" },
    { label: "Proses Edit", value: prosesCount, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
    { label: "Done", value: doneCount, icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
    { label: "Cancel", value: cancelCount, icon: X, color: "text-danger", bg: "bg-danger/10" },
  ];

  // ── Plan Card (dipakai bersama: desktop card grid + mobile list) ──
  function renderPlanCard(p: ContentPlan) {
    const pKey = getProgressKey(p.progress);
    return (
      <div
        key={p.id}
        onClick={() => openDetail(p)}
        className="card cursor-pointer p-4 transition-colors hover:border-primary/40 active:bg-surface/50"
      >
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{p.client?.name || "-"}</h3>
            <p className="text-xs text-muted">
              {monthName(p.month)}
            </p>
          </div>
          <span className={cn("badge", progressColors[pKey] || progressColors.draft)}>
            {progressLabels[pKey] || p.progress || "Draft"}
          </span>
        </div>
        {/* Info inti: stack vertikal rata kiri (Pilar → Konten → Tema → Tgl Upload) */}
        <div className="space-y-1.5 text-xs">
          {p.pilar && (
            <div>
              <span className="text-muted">Pilar:</span>{" "}
              <span className="font-medium text-foreground">{p.pilar}</span>
            </div>
          )}
          {p.konten && (
            <div>
              <span className="text-muted">Konten:</span>{" "}
              <span className="font-medium text-foreground">{p.konten}</span>
            </div>
          )}
          {p.tema && (
            <div>
              <span className="text-muted">Tema:</span>{" "}
              <span className="font-medium text-foreground">{p.tema}</span>
            </div>
          )}
          {p.tanggal_upload && (
            <div>
              <span className="text-muted">Tgl Upload:</span>{" "}
              <span className="font-medium text-foreground">{formatDate(p.tanggal_upload)}</span>
            </div>
          )}
        </div>
        {p.copy && (
          <div className="mt-2 flex items-start justify-between gap-2">
            <div className="line-clamp-3 flex-1"><RichText text={p.copy} className="text-sm text-foreground" /></div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyText(p.copy, "Copy");
              }}
              className="shrink-0 rounded p-1 text-muted hover:bg-background hover:text-primary"
              title="Copy Copy"
            >
              <Copy size={12} />
            </button>
          </div>
        )}
        {p.details && (
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="flex-1 text-xs text-muted">{p.details}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyText(p.details, "Details");
              }}
              className="shrink-0 rounded p-1 text-muted hover:bg-background hover:text-primary"
              title="Copy Details"
            >
              <Copy size={12} />
            </button>
          </div>
        )}
        {p.caption && (
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="line-clamp-2 flex-1 text-xs text-muted" title={p.caption}>
              {p.caption}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyText(p.caption, "Caption");
              }}
              className="shrink-0 rounded p-1 text-muted hover:bg-background hover:text-primary"
              title="Copy Caption"
            >
              <Copy size={12} />
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          {(p.copy || p.details || p.caption) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyAll(p);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Copy size={12} /> Copy All
            </button>
          )}
          {p.link_hasil && (
            <a
              href={p.link_hasil}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink size={12} /> Hasil
            </a>
          )}
          {p.reference && (
            <a
              href={p.reference}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink size={12} /> Reference
            </a>
          )}
          <ChevronRight size={16} className="ml-auto text-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Content Plans</h1>
          <p className="text-sm text-muted">Content production tracker per klien</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary">
            <Download size={16} /> Import Sheet
          </button>
          <button onClick={openCreate} className="btn-primary">
            <Plus size={16} /> New Plan
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{card.value}</p>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client, pilar, tema, copy, caption..."
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
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Bulan</option>
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthName(m, true)}
            </option>
          ))}
        </select>
        <select value={pilarFilter} onChange={(e) => setPilarFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Pilar</option>
          {PILAR_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value)} className="input w-auto">
          <option value="all">Semua Progress</option>
          <option value="draft">Draft</option>
          <option value="proses_edit">Proses Edit</option>
          <option value="done">Done</option>
          <option value="cancel">Cancel</option>
        </select>

        {/* View Mode Toggle */}
        <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-border">
          <button
            onClick={() => switchView("card")}
            title="Tampilan Card"
            className={cn(
              "flex items-center gap-1 px-3 text-xs font-medium transition-colors",
              viewMode === "card"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground"
            )}
          >
            <LayoutGrid size={14} /> Card
          </button>
          <button
            onClick={() => switchView("table")}
            title="Tampilan Tabel"
            className={cn(
              "flex items-center gap-1 px-3 text-xs font-medium transition-colors",
              viewMode === "table"
                ? "bg-primary text-white"
                : "bg-surface text-muted hover:text-foreground"
            )}
          >
            <TableIcon size={14} /> Table
          </button>
        </div>
      </div>

      {/* Table View */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="mb-3 text-muted" size={32} />
          <p className="text-muted">
            {plans.length === 0 ? "Belum ada content plan" : "Tidak ada plan yang cocok dengan filter"}
          </p>
          {plans.length === 0 ? (
            <button onClick={openCreate} className="btn-primary mt-4">
              <Plus size={16} /> Buat Plan Pertama
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch("");
                setProgressFilter("all");
                setPilarFilter("all");
                setClientFilter("all");
              }}
              className="btn-primary mt-4"
            >
              Reset Filter
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: Table / Card sesuai viewMode */}
          {viewMode === "table" ? (
          <div className="hidden max-h-[70dvh] overflow-auto rounded-lg border border-border lg:block">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                {/* Table ringkas — detail lengkap (Copy/Details/Caption/Reference/Link) ada di modal klik baris */}
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-3 py-3 font-medium">No</th>
                  <th className="px-3 py-3 font-medium">Client</th>
                  <th className="px-3 py-3 font-medium">Bulan</th>
                  <th className="px-3 py-3 font-medium">Pilar</th>
                  <th className="px-3 py-3 font-medium">Konten</th>
                  <th className="px-3 py-3 font-medium">Tema</th>
                  <th className="px-3 py-3 font-medium">Tgl Upload</th>
                  <th className="px-3 py-3 font-medium">Progress</th>
                  <th className="px-3 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => {
                  const pKey = getProgressKey(p.progress);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openDetail(p)}
                      className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface/50"
                    >
                      <td className="px-3 py-2.5 text-muted">{idx + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">
                        {p.client?.name || "-"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {monthName(p.month)}
                      </td>
                      <td className="px-3 py-2.5">
                        {parsePilars(p.pilar).length > 0 ? (
                          <div className="flex max-w-[200px] flex-wrap gap-1">
                            {parsePilars(p.pilar).map((pl) => (
                              <span key={pl} className="badge bg-background text-muted">
                                {pl}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {p.konten ? (
                          <span className="badge bg-background text-muted">{p.konten}</span>
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        {p.tema ? (
                          <span className="block truncate text-foreground" title={p.tema}>
                            {p.tema}
                          </span>
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted">
                        {p.tanggal_upload ? (
                          formatDate(p.tanggal_upload)
                        ) : (
                          <span className="text-muted/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-flex">
                          <select
                            value={pKey}
                            onChange={(e) => quickUpdateProgress(p, e.target.value)}
                            title="Ubah progress"
                            className={cn(
                              "cursor-pointer appearance-none rounded-full border-0 py-1 pl-2.5 pr-7 text-xs font-medium outline-none transition-opacity hover:opacity-80",
                              progressColors[pKey] || progressColors.draft
                            )}
                          >
                            {PROGRESS_OPTIONS.map((opt) => {
                              const key = getProgressKey(opt);
                              return (
                                <option key={opt} value={key}>
                                  {opt}
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-70" />
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {(p.copy || p.details || p.caption) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyAll(p);
                              }}
                              className="rounded p-1 text-muted hover:bg-background hover:text-primary"
                              title="Copy All"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                          <ChevronRight size={16} className="text-muted" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
              {filtered.map(renderPlanCard)}
            </div>
          )}

          {/* Mobile Cards */}
          <div className="space-y-3 lg:hidden">{filtered.map(renderPlanCard)}</div>
        </>
      )}

      {/* ── Detail Modal ─────────────────────────────────── */}
      {selectedPlan && (
        <PlanDetailModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onUpdated={() => {
            loadPlans();
            setSelectedPlan(null);
          }}
          onDeleted={() => loadPlans()}
        />
      )}

      {/* ── Import Sheet Modal ─────────────────────────────── */}
      {showImport && (
        <ImportSheetModal
          clients={clients}
          onClose={() => setShowImport(false)}
          onImported={() => {
            loadPlans();
            setShowImport(false);
          }}
        />
      )}

      {/* ── Create/Edit Modal ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "Edit Content Plan" : "Content Plan Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
                {/* Row 1: Client + Bulan */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client *</label>
                    <select
                      required
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Bulan *</label>
                    <input
                      type="month"
                      required
                      value={form.month}
                      onChange={(e) => setForm({ ...form, month: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Row 2: Pilar (multi-select chips) */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Pilar <span className="text-xs font-normal text-muted">(bisa pilih lebih dari 1)</span>
                  </label>
                  <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-2.5">
                    {PILAR_OPTIONS.map((p) => {
                      const selected = parsePilars(form.pilar).some(
                        (x) => x.toLowerCase() === p.toLowerCase()
                      );
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm({ ...form, pilar: togglePilarValue(form.pilar, p) })}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface text-muted hover:text-foreground"
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 2b: Konten + Tema */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Konten</label>
                    <select
                      value={form.konten}
                      onChange={(e) => setForm({ ...form, konten: e.target.value })}
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
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tema</label>
                    <input
                      type="text"
                      value={form.tema}
                      onChange={(e) => setForm({ ...form, tema: e.target.value })}
                      placeholder="Tema / angle konten..."
                      className="input"
                    />
                  </div>
                </div>

                {/* Row 3: Copy */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-medium text-foreground">Copy</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Bold (**teks**)"
                        onClick={() => {
                          const ta = document.getElementById("copy-textarea") as HTMLTextAreaElement | null;
                          if (ta) applyWrap(ta, "**", (v) => setForm((f) => ({ ...f, copy: v })));
                        }}
                        className="h-6 w-7 rounded border border-border bg-background text-xs font-bold hover:bg-muted"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        title="Italic (*teks*)"
                        onClick={() => {
                          const ta = document.getElementById("copy-textarea") as HTMLTextAreaElement | null;
                          if (ta) applyWrap(ta, "*", (v) => setForm((f) => ({ ...f, copy: v })));
                        }}
                        className="h-6 w-7 rounded border border-border bg-background text-xs italic hover:bg-muted"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        title="Bullet list"
                        onClick={() => {
                          const ta = document.getElementById("copy-textarea") as HTMLTextAreaElement | null;
                          if (ta) applyBullet(ta, (v) => setForm((f) => ({ ...f, copy: v })));
                        }}
                        className="h-6 w-7 rounded border border-border bg-background text-xs hover:bg-muted"
                      >
                        •
                      </button>
                    </div>
                  </div>
                  <textarea
                    id="copy-textarea"
                    rows={4}
                    value={form.copy}
                    onChange={(e) => setForm({ ...form, copy: e.target.value })}
                    placeholder="Copy / headline konten... (dukung **bold**, *italic*, bullet, link otomatis)"
                    className="input resize-y"
                  />
                </div>

                {/* Row 4: Details */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Details</label>
                  <textarea
                    rows={2}
                    value={form.details}
                    onChange={(e) => setForm({ ...form, details: e.target.value })}
                    placeholder="Detail konten, brief, atau instruksi..."
                    className="input resize-none"
                  />
                </div>

                {/* Row 5: Reference */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="URL atau referensi konten... (https:// otomatis)"
                    className="input"
                  />
                </div>

                {/* Row 6: Caption */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Caption</label>
                  <textarea
                    rows={3}
                    value={form.caption}
                    onChange={(e) => setForm({ ...form, caption: e.target.value })}
                    placeholder="Caption untuk konten..."
                    className="input resize-none"
                  />
                </div>

                {/* Row 6b: Thumbnail */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Thumbnail</label>
                  <textarea
                    rows={2}
                    value={form.thumbnail}
                    onChange={(e) => setForm({ ...form, thumbnail: e.target.value })}
                    placeholder="Copy / naskah thumbnail..."
                    className="input resize-none"
                  />
                </div>

                {/* Row 7: Link Hasil + Tgl Upload */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Link Hasil</label>
                    <input
                      type="text"
                      value={form.link_hasil}
                      onChange={(e) => setForm({ ...form, link_hasil: e.target.value })}
                      placeholder="https://... (otomatis ditambah https://)"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tanggal Upload</label>
                    <input
                      type="date"
                      value={form.tanggal_upload}
                      onChange={(e) => setForm({ ...form, tanggal_upload: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Row 8: Progress */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Progress</label>
                  <div className="flex gap-2">
                    {PROGRESS_OPTIONS.map((opt) => {
                      const key = getProgressKey(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setForm({ ...form, progress: opt })}
                          className={cn(
                            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            getProgressKey(form.progress) === key
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
              </div>

              {/* Sticky Footer */}
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
                    "Update Plan"
                  ) : (
                    "Simpan Plan"
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