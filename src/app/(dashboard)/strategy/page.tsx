"use client";

import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Target, Plus, X, Pencil, Trash2, Loader2, TrendingUp, AlertCircle,
  Building2, Share2, Swords, Layers, Zap, FileSpreadsheet, Palette, ExternalLink,
} from "lucide-react";
import { cn, extractError } from "@/lib/utils";
import ClientStrategyWizard from "@/components/strategy/client-strategy-wizard";
import { ClientPicker } from "@/components/strategy/client-picker";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

interface OKR {
  id: string;
  client_id: string | null;
  objective: string;
  key_result: string | null;
  quarter: string;
  year: number;
  owner_id: string | null;
  target_value: number | null;
  actual_value: number | null;
  baseline_value: number | null;
  unit: string | null;
  metric_name: string | null;
  kr_type: string | null;
  progress_pct: number;
  status: string;
  notes: string | null;
  owner?: { full_name: string | null };
}

interface TeamMember { id: string; full_name: string | null }
interface Client { id: string; name: string; notes: string | null; location: string | null; services: string[] }
interface SocialAcc { id: string; platform: string; handle: string | null; url: string | null; followers: number; ads_connected: boolean }
interface Competitor { id: string; name: string; platform: string | null; handle: string | null; followers: number; engagement_rate: number | null; posting_freq: string | null; positioning: string | null; weakness: string | null }
interface Principle { id: string; category: string; description: string }
interface Initiative { id: string; description: string; tag: string; status: string; okr_id: string | null }

const competitorUrl = (platform: string | null, handle: string | null): string | null => {
  if (!handle) return null;
  // Normalisasi handle: buang "@" di awal & "/" di akhir (input wizard/import bisa mengandung keduanya)
  const h = handle.trim().replace(/^@+/, "").replace(/\/+$/, "");
  if (!h) return null;
  switch (platform) {
    case "instagram": return `https://instagram.com/${h}`;
    case "tiktok": return `https://tiktok.com/@${h}`;
    case "facebook": return `https://facebook.com/${h}`;
    case "youtube": return `https://youtube.com/@${h}`;
    case "x": return `https://x.com/${h}`;
    default: return null;
  }
};

const emptyForm = {
  objective: "", key_result: "", quarter: "Q1", year: new Date().getFullYear(),
  owner_id: "", target_value: "", actual_value: "", unit: "%", notes: "",
};

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: "bg-success/20 text-success", label: "Completed" },
  on_track: { color: "bg-primary/20 text-primary", label: "On Track" },
  at_risk: { color: "bg-warning/20 text-warning", label: "At Risk" },
  behind: { color: "bg-danger/20 text-danger", label: "Behind" },
};

const progressBarColor = (pct: number) => {
  if (pct >= 100) return "bg-success";
  if (pct >= 70) return "bg-primary";
  if (pct >= 40) return "bg-warning";
  return "bg-danger";
};

const fmtNum = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "-";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "M";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "jt";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "rb";
  return n.toString();
};

// Render text dengan URL (mis. link deck Canva/Drive di notes) menjadi hyperlink clickable
function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/gi);
  return parts.map((p, i) =>
    /^https?:\/\//i.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-primary underline underline-offset-2 hover:text-primary/80">
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export default function StrategyPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"client" | "agency">("client");

  // shared
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [canvasIds, setCanvasIds] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);

  // canvas data (client mode)
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [socials, setSocials] = useState<SocialAcc[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);

  // agency OKR modal (lama)
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // check-in KR
  const [checkinKr, setCheckinKr] = useState<OKR | null>(null);
  const [checkinValue, setCheckinValue] = useState("");
  const [checkinSaving, setCheckinSaving] = useState(false);

  // import dari sheet
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importDryRun, setImportDryRun] = useState(false);
  const [importing, setImporting] = useState(false);

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importUrl.includes("docs.google.com")) { toast.error("URL Google Sheet tidak valid"); return; }
    setImporting(true);
    try {
      const res = await fetch("/api/import/strategy-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: importUrl, dryRun: importDryRun }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import gagal");
      const s = (json.summaries || []) as Array<{ sheet: string; imported: number; skipped?: number; error?: string }>;
      const lines = s.map((x) => `• ${x.sheet}: ${x.imported} masuk${x.skipped ? `, ${x.skipped} skip` : ""}${x.error ? ` (${x.error})` : ""}`);
      toast.success(importDryRun ? `Dry-run selesai:\n${lines.join("\n")}` : `Import selesai:\n${lines.join("\n")}`, { duration: 8000 });
      if (!importDryRun) { setShowImport(false); setImportUrl(""); if (selectedClientId) loadCanvas(selectedClientId); loadClients(); loadCanvasIds(); }
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    loadClients();
    loadTeam();
    loadCanvasIds();
  }, []);

  useEffect(() => {
    setQuarterFilter("all");
    if (selectedClientId) loadCanvas(selectedClientId);
    else if (tab === "agency") loadAgencyOkrs();
  }, [selectedClientId, tab]);

  async function loadClients() {
    try {
      const { data, error } = await supabase.from("clients").select("id, name, notes, location, services").order("name");
      if (error) throw error;
      const list = (data as unknown as Client[]) || [];
      setClients(list);
    } catch (err) {
      setError("Gagal memuat client: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadCanvasIds() {
    try {
      const [okrR, socR, compR, prinR, initR] = await Promise.all([
        supabase.from("okrs").select("client_id").not("client_id", "is", null),
        supabase.from("client_social_accounts").select("client_id"),
        supabase.from("client_competitors").select("client_id"),
        supabase.from("client_principles").select("client_id"),
        supabase.from("client_initiatives").select("client_id"),
      ]);
      const ids = new Set<string>();
      [okrR, socR, compR, prinR, initR].forEach((r) => {
        ((r.data as unknown as { client_id: string | null }[]) || []).forEach((row) => {
          if (row?.client_id) ids.add(row.client_id);
        });
      });
      setCanvasIds(ids);
    } catch {
      // indikator canvas opsional — abaikan error
    }
  }

  async function loadTeam() {
    const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
    setTeam((data as unknown as TeamMember[]) || []);
  }

  async function loadCanvas(clientId: string) {
    setLoading(true);
    try {
      const [okrRes, socRes, compRes, prinRes, initRes] = await Promise.all([
        supabase.from("okrs").select("*, owner:profiles!owner_id(full_name)").eq("client_id", clientId).order("created_at"),
        supabase.from("client_social_accounts").select("*").eq("client_id", clientId),
        supabase.from("client_competitors").select("*").eq("client_id", clientId),
        supabase.from("client_principles").select("*").eq("client_id", clientId).order("sort_order"),
        supabase.from("client_initiatives").select("*").eq("client_id", clientId).order("sort_order"),
      ]);
      if (okrRes.error) throw okrRes.error;
      setOkrs((okrRes.data as unknown as OKR[]) || []);
      setSocials((socRes.data as unknown as SocialAcc[]) || []);
      setCompetitors((compRes.data as unknown as Competitor[]) || []);
      setPrinciples((prinRes.data as unknown as Principle[]) || []);
      setInitiatives((initRes.data as unknown as Initiative[]) || []);
      setError(null);
    } catch (err) {
      setError("Gagal memuat canvas: " + extractError(err) + ". Pastikan migration-v87 sudah di-run.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAgencyOkrs() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("okrs")
        .select("*, owner:profiles!owner_id(full_name)")
        .is("client_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setOkrs((data as unknown as OKR[]) || []);
      setError(null);
    } catch (err) {
      setError("Gagal memuat OKR: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(okr: OKR) {
    setForm({
      objective: okr.objective,
      key_result: okr.key_result || "",
      quarter: okr.quarter,
      year: okr.year,
      owner_id: okr.owner_id || "",
      target_value: okr.target_value?.toString() || "",
      actual_value: okr.actual_value?.toString() || "",
      unit: okr.unit || "%",
      notes: okr.notes || "",
    });
    setEditingId(okr.id);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.objective.trim()) { toast.error("Objective wajib diisi"); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        objective: form.objective.trim(),
        key_result: form.key_result.trim() || null,
        quarter: form.quarter,
        year: form.year,
        owner_id: form.owner_id || null,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        actual_value: form.actual_value ? parseFloat(form.actual_value) : null,
        unit: form.unit || null,
        notes: form.notes.trim() || null,
        created_by: editingId ? undefined : userData.user?.id,
      };
      if (editingId) {
        const { error } = await supabase.from("okrs").update(payload as never).eq("id", editingId);
        if (error) throw error;
        toast.success("OKR diupdate!");
      } else {
        const { error } = await supabase.from("okrs").insert(payload as never);
        if (error) throw error;
        toast.success("OKR dibuat!");
      }
      setShowModal(false);
      loadAgencyOkrs();
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus OKR ini?")) return;
    try {
      const { error } = await supabase.from("okrs").delete().eq("id", id);
      if (error) throw error;
      toast.success("OKR dihapus");
      tab === "agency" ? loadAgencyOkrs() : selectedClientId && loadCanvas(selectedClientId);
    } catch (err) {
      toast.error("Gagal hapus: " + extractError(err));
    }
  }

  function openCheckin(kr: OKR) {
    setCheckinKr(kr);
    setCheckinValue(kr.actual_value?.toString() || "");
  }

  async function saveCheckin(e: React.FormEvent) {
    e.preventDefault();
    if (!checkinKr) return;
    const val = parseFloat(checkinValue);
    if (isNaN(val)) { toast.error("Nilai tidak valid"); return; }
    setCheckinSaving(true);
    try {
      // progress dihitung dari baseline → target
      const base = checkinKr.baseline_value || 0;
      const target = checkinKr.target_value || 0;
      let pct = 0;
      if (target > base) pct = Math.max(0, Math.min(100, Math.round(((val - base) / (target - base)) * 100)));
      else if (target !== 0) pct = Math.max(0, Math.min(100, Math.round((val / target) * 100)));
      const status = pct >= 100 ? "completed" : pct >= 70 ? "on_track" : pct >= 40 ? "at_risk" : "behind";
      const { error } = await supabase
        .from("okrs")
        .update({ actual_value: val, progress_pct: pct, status, last_checkin_at: new Date().toISOString() } as never)
        .eq("id", checkinKr.id);
      if (error) throw error;
      toast.success(`Check-in tersimpan — progress ${pct}%`);
      setCheckinKr(null);
      if (tab === "client" && selectedClientId) loadCanvas(selectedClientId);
      else loadAgencyOkrs();
    } catch (err) {
      toast.error("Gagal check-in: " + extractError(err));
    } finally {
      setCheckinSaving(false);
    }
  }

  // ================= RENDER HELPERS =================

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  // Group OKRs by objective (filter periode berlaku di kedua tab)
  const filtered = quarterFilter === "all"
    ? okrs
    : okrs.filter((o) => `${o.quarter}-${o.year}` === quarterFilter);

  const grouped = filtered.reduce((acc, okr) => {
    const key = `${okr.objective} [${okr.quarter} ${okr.year}]`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(okr);
    return acc;
  }, {} as Record<string, OKR[]>);

  const totalOKRs = filtered.length;
  const avgProgress = totalOKRs > 0 ? Math.round(filtered.reduce((s, o) => s + o.progress_pct, 0) / totalOKRs) : 0;
  const completedCount = filtered.filter((o) => o.status === "completed").length;
  const quarters = Array.from(new Set(okrs.map((o) => `${o.quarter}-${o.year}`))).sort().reverse();

  function renderKrRow(kr: OKR) {
    return (
      <div key={kr.id} className="group flex items-center gap-4 px-5 py-3 hover:bg-surface/50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{kr.key_result || "No Key Result defined"}</p>
            <span className={cn("badge text-xs", statusConfig[kr.status]?.color || statusConfig.on_track.color)}>
              {statusConfig[kr.status]?.label || kr.status}
            </span>
            {kr.kr_type && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", kr.kr_type === "leading" ? "bg-primary/10 text-primary" : "bg-muted/10 text-muted")}>
                {kr.kr_type === "leading" ? "Leading" : "Lagging"}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
            {kr.owner?.full_name && <span>👤 {kr.owner.full_name}</span>}
            {kr.target_value !== null && (
              <span>📊 {kr.actual_value ?? 0} / {kr.target_value} {kr.unit || ""}</span>
            )}
            {kr.baseline_value ? <span>⏱ Baseline: {kr.baseline_value}</span> : null}
            {kr.metric_name && <span>🧮 {kr.metric_name}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-background">
            <div className={cn("h-full transition-all", progressBarColor(kr.progress_pct))} style={{ width: `${kr.progress_pct}%` }} />
          </div>
          <span className="w-10 text-right text-sm font-bold text-foreground">{kr.progress_pct}%</span>
        </div>

        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => openCheckin(kr)} className="rounded p-1.5 text-muted hover:bg-background hover:text-primary" title="Check-in progress">
            <Zap size={14} />
          </button>
          <button onClick={() => openEdit(kr)} className="rounded p-1.5 text-muted hover:bg-background hover:text-primary" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={() => handleDelete(kr.id)} className="rounded p-1.5 text-muted hover:bg-background hover:text-danger" title="Hapus">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (loading && !okrs.length && !clients.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Strategy & OKR" subtitle="Client strategy canvas & agency OKR tracker" />
        <div className="skeleton h-32 rounded-lg" />
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Strategy & OKR"
        subtitle="Client strategy canvas & agency OKR tracker"
        actions={
          <>
            <button onClick={() => setShowImport(true)} className="btn-ghost border border-border">
              <FileSpreadsheet size={16} /> Import dari Sheet
            </button>
            <button onClick={() => setShowWizard(true)} className="btn-primary">
              <Plus size={16} /> Client Baru
            </button>
            {tab === "agency" && (
              <button onClick={openCreate} className="btn-ghost border border-border">
                <Target size={16} /> OKR Agency
              </button>
            )}
          </>
        }
      />

      {/* Tab switch */}
      <div className="flex gap-2">
        <button onClick={() => setTab("client")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium", tab === "client" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>
          <Palette size={13} /> Client Strategy Canvas
        </button>
        <button onClick={() => setTab("agency")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium", tab === "agency" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>
          <Building2 size={13} /> Agency OKR
        </button>
      </div>

      {error && (
        <div className="card flex items-start gap-3 border-danger/30 p-4">
          <AlertCircle className="mt-0.5 shrink-0 text-danger" size={18} />
          <div className="text-sm text-muted">
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-2">Coba Lagi</button>
          </div>
        </div>
      )}

      {tab === "client" ? (
        <>
          {/* Client selector */}
          <div className="flex flex-wrap items-center gap-3">
            <ClientPicker
              clients={clients}
              selectedId={selectedClientId}
              onChange={setSelectedClientId}
              canvasIds={canvasIds}
            />
            {clients.length > 0 && (
              <span className="text-xs text-muted">
                {canvasIds.size} dari {clients.length} client punya canvas
              </span>
            )}
            {clients.length === 0 && (
              <span className="text-xs text-muted">Belum ada client — klik "Client Baru" untuk membuat canvas pertama.</span>
            )}
          </div>

          {selectedClient && (
            <>
              {/* Profil + Sosmed + 4M */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="card p-5">
                  <div className="flex items-center gap-2 text-muted"><Building2 size={14} /><span className="text-xs font-semibold uppercase">Profil</span></div>
                  <h3 className="mt-2 font-bold text-foreground">{selectedClient.name}</h3>
                  {selectedClient.location && <p className="mt-1 text-xs text-muted">📍 {selectedClient.location}</p>}
                  {selectedClient.notes && <p className="mt-2 text-xs leading-relaxed text-muted">{renderWithLinks(selectedClient.notes)}</p>}
                  {selectedClient.services?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedClient.services.map((s) => <span key={s} className="badge bg-primary/10 text-primary text-[10px]">{s}</span>)}
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <div className="flex items-center gap-2 text-muted"><Share2 size={14} /><span className="text-xs font-semibold uppercase">Aset Digital</span></div>
                  {socials.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">Belum ada akun sosmed terdaftar.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {socials.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground capitalize">{s.platform} {s.handle ? `· ${s.handle}` : ""}</p>
                            {s.followers > 0 && <p className="text-[10px] text-muted">{fmtNum(s.followers)} followers</p>}
                          </div>
                          {s.ads_connected && <span className="badge bg-success/15 text-success text-[10px]">Ads ✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <div className="flex items-center gap-2 text-muted"><Layers size={14} /><span className="text-xs font-semibold uppercase">Principles 4M</span></div>
                  {principles.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">Belum ada principles.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {principles.map((p) => (
                        <div key={p.id} className="rounded-md border border-border bg-background px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase text-primary">{p.category === "manpower" ? "Man Power" : p.category}</p>
                          <p className="mt-0.5 text-xs text-foreground">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Kompetitor + Initiatives */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="card p-5">
                  <div className="flex items-center gap-2 text-muted"><Swords size={14} /><span className="text-xs font-semibold uppercase">Benchmark Kompetitor</span></div>
                  {competitors.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">Belum ada data kompetitor.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {competitors.map((c) => (
                        <div key={c.id} className="rounded-md border border-border bg-background px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">{c.name}</p>
                            {competitorUrl(c.platform, c.handle) && (
                              <a href={competitorUrl(c.platform, c.handle)!} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors hover:border-primary hover:text-primary">
                                <ExternalLink size={10} />
                                Profil
                              </a>
                            )}
                          </div>
                          <p className="mt-1 text-[10px] text-muted capitalize">{c.platform || "—"}{c.followers > 0 ? ` · ${fmtNum(c.followers)} foll` : ""}{c.engagement_rate ? ` · ER ${c.engagement_rate}%` : ""}</p>
                          {(c.positioning || c.weakness) && (
                            <p className="mt-1 text-[11px] text-muted">
                              {c.positioning && <span className="text-success">+ {c.positioning}</span>}
                              {c.positioning && c.weakness && " · "}
                              {c.weakness && <span className="text-danger">− {c.weakness}</span>}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card p-5">
                  <div className="flex items-center gap-2 text-muted"><Zap size={14} /><span className="text-xs font-semibold uppercase">Initiatives (SM / ADS)</span></div>
                  {initiatives.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">Belum ada initiatives.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {initiatives.map((it) => (
                        <div key={it.id} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                          <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", it.tag === "ADS" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning")}>{it.tag}</span>
                          <p className="text-xs text-foreground">{it.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* OKR client */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-bold uppercase text-muted"><Target size={14} /> OKR Client</h2>
                  <span className="text-xs text-muted">{totalOKRs} KR · avg {avgProgress}% · {completedCount} selesai</span>
                </div>
                {quarters.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setQuarterFilter("all")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", quarterFilter === "all" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>Semua Periode</button>
                    {quarters.map((q) => (
                      <button key={q} onClick={() => setQuarterFilter(q)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", quarterFilter === q ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>{q}</button>
                    ))}
                  </div>
                )}
                {totalOKRs === 0 ? (
                  <EmptyState
                    icon={Target}
                    title="Client ini belum punya OKR"
                    description='Gunakan wizard "Client Baru", tombol "Import dari Sheet", atau tambah via OKR Agency.'
                  />
                ) : (
                  Object.entries(grouped).map(([objective, krs]) => {
                    const objAvg = krs.length > 0 ? Math.round(krs.reduce((s, k) => s + k.progress_pct, 0) / krs.length) : 0;
                    return (
                      <div key={objective} className="card overflow-hidden p-0">
                        <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Target className="text-primary" size={16} />
                              <h3 className="font-semibold text-foreground">{objective}</h3>
                            </div>
                            <p className="mt-1 text-xs text-muted">{krs.length} Key Result{krs.length > 1 ? "s" : ""} • Avg: {objAvg}%</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-background">
                              <div className={cn("h-full transition-all", progressBarColor(objAvg))} style={{ width: `${objAvg}%` }} />
                            </div>
                            <span className="text-sm font-bold text-foreground">{objAvg}%</span>
                          </div>
                        </div>
                        <div className="divide-y divide-border">{krs.map(renderKrRow)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
          {!selectedClient && clients.length > 0 && (
            <EmptyState
              icon={Building2}
              title="Pilih client untuk melihat strategy canvas"
              description="Gunakan dropdown di atas — titik hijau menandakan client yang sudah punya data canvas, atau aktifkan filter “Hanya yang punya canvas”."
            />
          )}
        </>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-muted">Total Key Results</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{totalOKRs}</p>
                </div>
                <Target className="text-primary" size={24} />
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-muted">Avg Progress</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{avgProgress}%</p>
                </div>
                <TrendingUp className="text-success" size={24} />
              </div>
            </div>
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-muted">Completed</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{completedCount}<span className="text-sm text-muted"> / {totalOKRs}</span></p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/20">
                  <span className="text-sm font-bold text-success">✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quarter Filter */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setQuarterFilter("all")} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", quarterFilter === "all" ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>Semua Periode</button>
            {quarters.map((q) => (
              <button key={q} onClick={() => setQuarterFilter(q)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", quarterFilter === q ? "bg-primary text-white" : "bg-surface text-muted hover:text-foreground")}>{q}</button>
            ))}
          </div>

          {/* OKR List */}
          {totalOKRs === 0 ? (
            <EmptyState
              icon={Target}
              title="Belum ada OKR internal agency"
              action={<button onClick={openCreate} className="btn-primary"><Plus size={16} /> Buat OKR</button>}
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([objective, krs]) => {
                const objAvg = krs.length > 0 ? Math.round(krs.reduce((s, k) => s + k.progress_pct, 0) / krs.length) : 0;
                return (
                  <div key={objective} className="card overflow-hidden p-0">
                    <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Target className="text-primary" size={16} />
                          <h3 className="font-semibold text-foreground">{objective}</h3>
                        </div>
                        <p className="mt-1 text-xs text-muted">{krs.length} Key Result{krs.length > 1 ? "s" : ""} • Avg: {objAvg}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-background">
                          <div className={cn("h-full transition-all", progressBarColor(objAvg))} style={{ width: `${objAvg}%` }} />
                        </div>
                        <span className="text-sm font-bold text-foreground">{objAvg}%</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">{krs.map(renderKrRow)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Wizard Client Baru */}
      <ClientStrategyWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onCreated={() => { loadClients(); }}
      />

      {/* Modal Import dari Sheet */}
      <Modal
        open={showImport}
        onClose={() => setShowImport(false)}
        title="Import Strategy dari Sheet"
        size="lg"
        scrollable
        footer={
          <>
            <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
            <button type="submit" form="strategy-import-form" disabled={importing} className="btn-primary">
              {importing ? <><Loader2 size={14} className="animate-spin" /> Mengimpor...</> : <><FileSpreadsheet size={14} /> {importDryRun ? "Dry Run" : "Import"}</>}
            </button>
          </>
        }
      >
        <form id="strategy-import-form" onSubmit={runImport} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">URL Google Sheet (Published)</label>
            <input type="url" required value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/e/.../pubhtml" className="input" />
            <p className="mt-1 text-xs text-muted">Sheet harus sudah di-publish (File → Share → Publish to web). Tab dikenali otomatis: Sosmed, Kompetitor, 4M/Principles, Initiatives/Strategy, OKR.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={importDryRun} onChange={(e) => setImportDryRun(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Dry run (validasi tanpa menulis data)
          </label>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
            Data lama per-client akan diganti dengan data sheet (replace). Pastikan tab pertama sheet berisi kolom <b>Client</b> untuk pemetaan.
          </div>
        </form>
      </Modal>

      {/* Check-in Modal */}
      <Modal
        open={!!checkinKr}
        onClose={() => setCheckinKr(null)}
        title="Check-in KR"
        size="sm"
        scrollable
        footer={
          <>
            <button type="button" onClick={() => setCheckinKr(null)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
            <button type="submit" form="checkin-form" disabled={checkinSaving} className="btn-primary">
              {checkinSaving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : "Simpan Check-in"}
            </button>
          </>
        }
      >
        {checkinKr && (
          <form id="checkin-form" onSubmit={saveCheckin} className="space-y-4">
            <p className="text-sm text-muted">{checkinKr.key_result}</p>
            <p className="text-xs text-muted">
              Baseline {checkinKr.baseline_value || 0} → Target {checkinKr.target_value} {checkinKr.unit || ""}
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Nilai Aktual Saat Ini</label>
              <input type="number" step="0.01" autoFocus className="input" value={checkinValue} onChange={(e) => setCheckinValue(e.target.value)} placeholder="0" />
              <p className="mt-1 text-xs text-muted">Progress & status akan dihitung otomatis dari baseline → target.</p>
            </div>
          </form>
        )}
      </Modal>

      {/* Create/Edit Modal Agency OKR */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? "Edit OKR" : "OKR Agency Baru"}
        size="md"
        scrollable
        footer={
          <>
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
                <button type="submit" form="okr-form" disabled={saving} className="btn-primary">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : editingId ? "Update OKR" : "Simpan OKR"}
                </button>
          </>
        }
      >
        <form id="okr-form" onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Objective *</label>
                  <input type="text" required value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Contoh: Tingkatkan revenue agency Q1" className="input" />
                  <p className="mt-1 text-xs text-muted">Objective = tujuan strategis (qualitative)</p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Key Result</label>
                  <input type="text" value={form.key_result} onChange={(e) => setForm({ ...form, key_result: e.target.value })} placeholder="Contoh: Capai ROAS rata-rata 3.5" className="input" />
                  <p className="mt-1 text-xs text-muted">Key Result = cara mengukur objective (quantitative)</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Quarter</label>
                    <select value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })} className="input">
                      <option value="Q1">Q1 (Jan-Mar)</option>
                      <option value="Q2">Q2 (Apr-Jun)</option>
                      <option value="Q3">Q3 (Jul-Sep)</option>
                      <option value="Q4">Q4 (Okt-Des)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Tahun</label>
                    <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })} className="input" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Owner (PIC)</label>
                  <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className="input">
                    <option value="">— Pilih Owner —</option>
                    {team.map((t) => <option key={t.id} value={t.id}>{t.full_name || "Unknown"}</option>)}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Target</label>
                    <input type="number" step="0.01" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} placeholder="100" className="input" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Actual</label>
                    <input type="number" step="0.01" value={form.actual_value} onChange={(e) => setForm({ ...form, actual_value: e.target.value })} placeholder="0" className="input" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Unit</label>
                    <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, IDR, ROAS" className="input" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Catatan</label>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan..." className="input resize-none" />
                </div>
                      </form>
      </Modal>
    </div>
  );
}