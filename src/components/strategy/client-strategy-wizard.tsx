"use client";

import { ArrowRight, Building2, CalendarClock, Check, Layers, Loader2, Plus, Share2, Swords, Target, Trash2, X } from 'lucide-react';
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn, extractError } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { sopTasksToPayload } from "@/lib/sop-templates";

interface TeamMember { id: string; full_name: string | null }

interface SocialRow { platform: string; handle: string; url: string; followers: string; ads_connected: boolean }
interface CompetitorRow { name: string; platform: string; handle: string; followers: string; engagement_rate: string; posting_freq: string; positioning: string; weakness: string }
interface KrRow { metric_name: string; key_result: string; baseline: string; target: string; unit: string; kr_type: "leading" | "lagging"; owner_id: string }
interface OkrRow { objective: string; quarter: string; year: number; krs: KrRow[] }
interface InitiativeRow { description: string; tag: "SM" | "ADS"; okr_index: number }

const PLATFORMS = ["instagram", "tiktok", "facebook", "youtube", "whatsapp", "x"];
const SERVICES = ["Meta Ads (CTWA)", "Meta Ads (Lead Form)", "Social Media Management", "Content Production", "Google Ads", "KOL Management"];

const STEPS = [
  { label: "Profil", icon: Building2 },
  { label: "Sosmed", icon: Share2 },
  { label: "Kompetitor", icon: Swords },
  { label: "OKR", icon: Target },
  { label: "4M & Initiatives", icon: Layers },
  { label: "Timeline SOP", icon: CalendarClock },
];

export default function ClientStrategyWizard({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);

  // Step 1: profil
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [services, setServices] = useState<string[]>([]);

  // Step 2: sosmed
  const [socials, setSocials] = useState<SocialRow[]>([
    { platform: "instagram", handle: "", url: "", followers: "", ads_connected: false },
  ]);

  // Step 3: kompetitor
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);

  // Step 4: OKR
  const [okrs, setOkrs] = useState<OkrRow[]>([
    { objective: "", quarter: `Q${Math.floor(new Date().getMonth() / 3) + 1}`, year: new Date().getFullYear(), krs: [{ metric_name: "", key_result: "", baseline: "", target: "", unit: "", kr_type: "lagging", owner_id: "" }] },
  ]);

  // Step 5: 4M + initiatives
  const [p4m, setP4m] = useState({ mindset: "", manpower: "", tools: "", budget: "" });
  const [initiatives, setInitiatives] = useState<InitiativeRow[]>([]);

  // Step 6: SOP
  const [includeSop, setIncludeSop] = useState(true);

  // Load team sekali saat modal dibuka — WAJIB useEffect sebelum early-return (Rules of Hooks)
  useEffect(() => {
    if (!open || team.length) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name")
      .then(({ data }) => {
        if (!cancelled) setTeam((data as unknown as TeamMember[]) || []);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function validateStep(): string | null {
    if (step === 0 && !name.trim()) return "Nama client wajib diisi";
    if (step === 3) {
      for (const o of okrs) {
        if (!o.objective.trim()) return "Semua objective wajib diisi";
        for (const kr of o.krs) {
          if (!kr.key_result.trim()) return "Semua Key Result wajib diisi";
          if (!kr.target) return "Target KR wajib diisi agar progress terukur";
        }
      }
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Nama client wajib diisi"); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      // 1. Client
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const clientPayload = {
        name: name.trim(),
        slug,
        industry: null,
        services,
        notes: description.trim() || null,
        location: location.trim() || null,
      };
      const { data: client, error: eClient } = await supabase
        .from("clients")
        .insert(clientPayload as never)
        .select("id")
        .single();
      if (eClient || !client) throw eClient || new Error("Client id tidak didapat");
      const clientId = (client as unknown as { id: string }).id;

      // 2. Sosmed
      const socPayload = socials
        .filter((s) => s.handle.trim() || s.url.trim())
        .map((s) => ({ client_id: clientId, platform: s.platform, handle: s.handle || null, url: s.url || null, followers: s.followers ? parseInt(s.followers) : 0, ads_connected: s.ads_connected }));
      if (socPayload.length) {
        const { error: e } = await supabase.from("client_social_accounts").insert(socPayload as never);
        if (e) throw e;
      }

      // 3. Kompetitor
      const compPayload = competitors
        .filter((c) => c.name.trim())
        .map((c) => ({ client_id: clientId, name: c.name.trim(), platform: c.platform || null, handle: c.handle || null, followers: c.followers ? parseInt(c.followers) : 0, engagement_rate: c.engagement_rate ? parseFloat(c.engagement_rate) : null, posting_freq: c.posting_freq || null, positioning: c.positioning || null, weakness: c.weakness || null }));
      if (compPayload.length) {
        const { error: e } = await supabase.from("client_competitors").insert(compPayload as never);
        if (e) throw e;
      }

      // 4. OKR (setiap KR = 1 row)
      const okrIdByIndex: (string | null)[] = [];
      for (let i = 0; i < okrs.length; i++) {
        const o = okrs[i];
        const krRows = o.krs.map((kr) => ({
          client_id: clientId,
          objective: o.objective.trim(),
          quarter: o.quarter,
          year: o.year,
          key_result: kr.key_result.trim(),
          metric_name: kr.metric_name.trim() || null,
          baseline_value: kr.baseline ? parseFloat(kr.baseline) : 0,
          target_value: kr.target ? parseFloat(kr.target) : null,
          actual_value: kr.baseline ? parseFloat(kr.baseline) : 0,
          unit: kr.unit || null,
          kr_type: kr.kr_type,
          owner_id: kr.owner_id || null,
          progress_pct: 0,
          created_by: uid,
        }));
        const { data: inserted, error: e } = await supabase.from("okrs").insert(krRows as never).select("id");
        if (e) throw e;
        okrIdByIndex[i] = (inserted as unknown as { id: string }[] | null)?.[0]?.id ?? null;
      }

      // 5a. Principles 4M
      const p4mRows = [
        { category: "mindset", description: p4m.mindset },
        { category: "manpower", description: p4m.manpower },
        { category: "tools", description: p4m.tools },
        { category: "budget", description: p4m.budget },
      ].filter((p) => p.description.trim());
      if (p4mRows.length) {
        const { error: e } = await supabase
          .from("client_principles")
          .insert(p4mRows.map((p, i) => ({ client_id: clientId, category: p.category, description: p.description.trim(), sort_order: i })) as never);
        if (e) throw e;
      }

      // 5b. Initiatives
      const initRows = initiatives
        .filter((it) => it.description.trim())
        .map((it, i) => ({ client_id: clientId, okr_id: okrIdByIndex[it.okr_index] || null, description: it.description.trim(), tag: it.tag, sort_order: i }));
      if (initRows.length) {
        const { error: e } = await supabase.from("client_initiatives").insert(initRows as never);
        if (e) throw e;
      }

      // 6. SOP tasks
      if (includeSop) {
        const taskRows = sopTasksToPayload(name.trim()).map((t) => ({ ...t, client_id: clientId, created_by: uid }));
        const { error: e } = await supabase.from("tasks").insert(taskRows as never);
        if (e) throw e;
      }

      toast.success(`Client "${name}" + strategy canvas berhasil dibuat!`);
      onCreated();
      onClose();
      // reset
      setStep(0); setName(""); setDescription(""); setLocation(""); setServices([]);
      setSocials([{ platform: "instagram", handle: "", url: "", followers: "", ads_connected: false }]);
      setCompetitors([]);
      setOkrs([{ objective: "", quarter: `Q${Math.floor(new Date().getMonth() / 3) + 1}`, year: new Date().getFullYear(), krs: [{ metric_name: "", key_result: "", baseline: "", target: "", unit: "", kr_type: "lagging", owner_id: "" }] }]);
      setP4m({ mindset: "", manpower: "", tools: "", budget: "" });
      setInitiatives([]); setIncludeSop(true);
    } catch (err) {
      toast.error("Gagal menyimpan: " + extractError(err));
    } finally {
      setSaving(false);
    }
  }

  const sopPreview = sopTasksToPayload(name || "Client");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      scrollable
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost text-sm text-muted hover:text-foreground">Batal</button>
          {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} className="btn-ghost border border-border px-4 py-2 text-sm">← Kembali</button>}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="btn-primary px-4 py-2 text-sm">Lanjut <ArrowRight size={12} className="inline" /></button>
          ) : (
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : <><Check size={14} /> Buat Client + Canvas</>}
            </button>
          )}
        </>
      }
      header={
        <div className="shrink-0 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Client Strategy Canvas</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-background hover:text-foreground"><X size={18} /></button>
          </div>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <button key={s.label} onClick={() => i < step && setStep(i)} className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  i === step ? "bg-primary text-white" : i < step ? "bg-primary/15 text-primary" : "bg-background text-muted"
                )}>
                  {i < step ? <Check size={12} /> : <Icon size={12} />}
                  {i + 1}. {s.label}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Nama Client *</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: RMODA Studio BSD" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Deskripsi / Brand Profile</label>
                <textarea rows={3} className="input resize-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Adalah brand coating mobil premium yang memiliki berbagai services..." />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Lokasi</label>
                <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Contoh: BSD, Tangerang" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Services</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICES.map((s) => (
                    <button key={s} type="button" onClick={() => setServices((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                      className={cn("rounded-full px-3 py-1.5 text-xs font-medium", services.includes(s) ? "bg-primary text-white" : "bg-background text-muted hover:text-foreground")}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p className="text-xs text-muted">Aset digital client — baseline followers & status akses ads (prasyarat Meta Ads).</p>
              {socials.map((s, i) => (
                <div key={i} className="card space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Akun #{i + 1}</span>
                    {socials.length > 1 && (
                      <button onClick={() => setSocials((p) => p.filter((_, x) => x !== i))} className="rounded p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="input" value={s.platform} onChange={(e) => setSocials((p) => p.map((r, x) => x === i ? { ...r, platform: e.target.value } : r))}>
                      {PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
                    </select>
                    <input className="input" placeholder="@handle" value={s.handle} onChange={(e) => setSocials((p) => p.map((r, x) => x === i ? { ...r, handle: e.target.value } : r))} />
                  </div>
                  <input className="input" placeholder="URL (opsional)" value={s.url} onChange={(e) => setSocials((p) => p.map((r, x) => x === i ? { ...r, url: e.target.value } : r))} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input type="number" className="input sm:flex-1" placeholder="Followers baseline" value={s.followers} onChange={(e) => setSocials((p) => p.map((r, x) => x === i ? { ...r, followers: e.target.value } : r))} />
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={s.ads_connected} onChange={(e) => setSocials((p) => p.map((r, x) => x === i ? { ...r, ads_connected: e.target.checked } : r))} className="h-4 w-4 accent-primary" />
                      Terhubung ads
                    </label>
                  </div>
                </div>
              ))}
              <button onClick={() => setSocials((p) => [...p, { platform: "tiktok", handle: "", url: "", followers: "", ads_connected: false }])} className="btn-ghost w-full border border-dashed border-border text-sm"><Plus size={14} /> Tambah Akun</button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-xs text-muted">Benchmark kompetitor — dasar penetapan target KR yang realistis.</p>
              {competitors.map((c, i) => (
                <div key={i} className="card space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <input className="input max-w-[60%] text-sm font-semibold" placeholder="Nama kompetitor" value={c.name} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, name: e.target.value } : r))} />
                    <button onClick={() => setCompetitors((p) => p.filter((_, x) => x !== i))} className="rounded p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="input" value={c.platform} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, platform: e.target.value } : r))}>
                      <option value="">— Platform —</option>
                      {PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
                    </select>
                    <input className="input" placeholder="@handle" value={c.handle} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, handle: e.target.value } : r))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input type="number" className="input" placeholder="Followers" value={c.followers} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, followers: e.target.value } : r))} />
                    <input type="number" step="0.1" className="input" placeholder="ER %" value={c.engagement_rate} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, engagement_rate: e.target.value } : r))} />
                    <input className="input" placeholder="4x/minggu" value={c.posting_freq} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, posting_freq: e.target.value } : r))} />
                  </div>
                  <input className="input" placeholder="Positioning / kekuatan (mis. harga murah)" value={c.positioning} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, positioning: e.target.value } : r))} />
                  <input className="input" placeholder="Kelemahan / content gap (mis. tidak ada konten edukasi)" value={c.weakness} onChange={(e) => setCompetitors((p) => p.map((r, x) => x === i ? { ...r, weakness: e.target.value } : r))} />
                </div>
              ))}
              <button onClick={() => setCompetitors((p) => [...p, { name: "", platform: "", handle: "", followers: "", engagement_rate: "", posting_freq: "", positioning: "", weakness: "" }])} className="btn-ghost w-full border border-dashed border-border text-sm"><Plus size={14} /> Tambah Kompetitor</button>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-xs text-muted">Objective = tujuan. KR terstruktur: baseline → target, pilih leading (indikator dini) atau lagging (hasil akhir).</p>
              {okrs.map((o, oi) => (
                <div key={oi} className="card space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">Objective #{oi + 1}</span>
                    {okrs.length > 1 && (
                      <button onClick={() => setOkrs((p) => p.filter((_, x) => x !== oi))} className="rounded p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <input className="input" placeholder="Contoh: Meningkatkan sales melalui iklan CTWA" value={o.objective} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, objective: e.target.value } : r))} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="input" value={o.quarter} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, quarter: e.target.value } : r))}>
                      <option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q3">Q3</option><option value="Q4">Q4</option>
                    </select>
                    <input type="number" className="input" value={o.year} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, year: parseInt(e.target.value) } : r))} />
                  </div>
                  {o.krs.map((kr, ki) => (
                    <div key={ki} className="space-y-2 rounded-md border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted">Key Result #{ki + 1}</span>
                        {o.krs.length > 1 && (
                          <button onClick={() => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.filter((_, y) => y !== ki) } : r))} className="text-muted hover:text-danger"><Trash2 size={12} /></button>
                        )}
                      </div>
                      <input className="input" placeholder="Contoh: Mencapai ROAS 5" value={kr.key_result} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, key_result: e.target.value } : k) } : r))} />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <input className="input" placeholder="Metrik (ROAS)" value={kr.metric_name} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, metric_name: e.target.value } : k) } : r))} />
                        <input type="number" step="0.01" className="input" placeholder="Baseline" value={kr.baseline} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, baseline: e.target.value } : k) } : r))} />
                        <input type="number" step="0.01" className="input" placeholder="Target *" value={kr.target} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, target: e.target.value } : k) } : r))} />
                        <input className="input" placeholder="Unit (x, IDR)" value={kr.unit} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, unit: e.target.value } : k) } : r))} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select className="input" value={kr.kr_type} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, kr_type: e.target.value as "leading" | "lagging" } : k) } : r))}>
                          <option value="lagging">Lagging (hasil akhir)</option>
                          <option value="leading">Leading (indikator dini)</option>
                        </select>
                        <select className="input" value={kr.owner_id} onChange={(e) => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: r.krs.map((k, y) => y === ki ? { ...k, owner_id: e.target.value } : k) } : r))}>
                          <option value="">— PIC —</option>
                          {team.map((t) => <option key={t.id} value={t.id}>{t.full_name || "Unknown"}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setOkrs((p) => p.map((r, x) => x === oi ? { ...r, krs: [...r.krs, { metric_name: "", key_result: "", baseline: "", target: "", unit: "", kr_type: "lagging", owner_id: "" }] } : r))} className="btn-ghost w-full border border-dashed border-border text-xs"><Plus size={12} /> Tambah KR</button>
                </div>
              ))}
              <button onClick={() => setOkrs((p) => [...p, { objective: "", quarter: `Q${Math.floor(new Date().getMonth() / 3) + 1}`, year: new Date().getFullYear(), krs: [{ metric_name: "", key_result: "", baseline: "", target: "", unit: "", kr_type: "lagging", owner_id: "" }] }])} className="btn-ghost w-full border border-dashed border-border text-sm"><Plus size={14} /> Tambah Objective</button>
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-xs text-muted">Principles 4M dari canvas sheet client.</p>
              <div className="card space-y-3 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">On Mindset</label>
                  <input className="input" placeholder="Meningkatkan traffic & revenue client" value={p4m.mindset} onChange={(e) => setP4m({ ...p4m, mindset: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">On Man Power (PIC)</label>
                  <input className="input" placeholder="Yoga, Ovi" value={p4m.manpower} onChange={(e) => setP4m({ ...p4m, manpower: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">On Tools</label>
                  <input className="input" placeholder="Fanpage, ad account, akses IG" value={p4m.tools} onChange={(e) => setP4m({ ...p4m, tools: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">On Budget</label>
                  <input className="input" placeholder="Rp 16.800.000 / bulan" value={p4m.budget} onChange={(e) => setP4m({ ...p4m, budget: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted">Initiatives (dari "Strategy and KPI") — aktivitas untuk mencapai KR.</p>
              {initiatives.map((it, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row">
                  <select className="input w-full sm:w-28" value={it.tag} onChange={(e) => setInitiatives((p) => p.map((r, x) => x === i ? { ...r, tag: e.target.value as "SM" | "ADS" } : r))}>
                    <option value="SM">SM</option><option value="ADS">ADS</option>
                  </select>
                  <select className="input w-full sm:w-40" value={it.okr_index} onChange={(e) => setInitiatives((p) => p.map((r, x) => x === i ? { ...r, okr_index: parseInt(e.target.value) } : r))}>
                    {okrs.map((o, oi) => <option key={oi} value={oi}>→ {o.objective.slice(0, 28) || `Objective ${oi + 1}`}</option>)}
                  </select>
                  <input className="input flex-1" placeholder="Contoh: Mengiklankan hero product dengan ad creative terkait services prioritas" value={it.description} onChange={(e) => setInitiatives((p) => p.map((r, x) => x === i ? { ...r, description: e.target.value } : r))} />
                  <button onClick={() => setInitiatives((p) => p.filter((_, x) => x !== i))} className="self-center rounded p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => setInitiatives((p) => [...p, { description: "", tag: "ADS", okr_index: 0 }])} className="btn-ghost w-full border border-dashed border-border text-sm"><Plus size={14} /> Tambah Initiative</button>
            </>
          )}

          {step === 5 && (
            <>
              <p className="text-xs text-muted">Auto-generate SOP onboarding standar Hadona menjadi tasks (muncul di /tasks, ter-link ke client ini).</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                <input type="checkbox" checked={includeSop} onChange={(e) => setIncludeSop(e.target.checked)} className="h-4 w-4 accent-primary" />
                Buat {sopPreview.length} tasks SOP onboarding
              </label>
              {includeSop && (
                <div className="card divide-y divide-border p-0">
                  {sopPreview.map((t, i) => (
                    <div key={i} className="flex flex-col gap-0.5 px-4 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span className="min-w-0 break-words text-foreground">{i + 1}. {t.title}</span>
                      <span className="shrink-0 text-muted">{t.start_date} → {t.due_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
      </div>
    </Modal>
  );
}