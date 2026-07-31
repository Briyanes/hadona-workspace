"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Image as ImageIcon, Plus, Trash2, Loader2, Crown, ThumbsUp, ThumbsDown, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatIDR, formatCompact, cn, extractError } from "@/lib/utils";

interface Creative {
  id: string;
  report_id: string;
  creative_name: string;
  creative_type: string;
  platform: string;
  thumbnail_url: string | null;
  metrics: Record<string, number>;
  status: string;
  is_winner: boolean;
  notes: string | null;
}

const CREATIVE_TYPES = [
  { value: "image", label: "🖼️ Image" },
  { value: "video", label: "🎬 Video" },
  { value: "carousel", label: "🎠 Carousel" },
  { value: "collection", label: "📚 Collection" },
  { value: "story", label: "📱 Story" },
  { value: "reel", label: "🎵 Reel" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Zap; label: string }> = {
  active: { color: "text-success", icon: Zap, label: "Active" },
  paused: { color: "text-muted", icon: ThumbsDown, label: "Paused" },
  under_review: { color: "text-warning", icon: AlertTriangle, label: "Under Review" },
  exhausted: { color: "text-danger", icon: ThumbsDown, label: "Exhausted" },
};

export function CreativePerformanceTracker({ reportId }: { reportId: string }) {
  const supabase = createClient();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newCreative, setNewCreative] = useState({
    creative_name: "",
    creative_type: "video",
    platform: "META",
    spend: "",
    impressions: "",
    clicks: "",
    conversions: "",
    ctr: "",
    cpr: "",
    roas: "",
    frequency: "",
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("creative_performance")
        .select("*")
        .eq("report_id", reportId)
        .order("is_winner", { ascending: false }) // winner first
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCreatives((data as unknown as Creative[]) || []);
    } catch (err) {
      toast.error("Gagal load creative: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, reportId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCreative.creative_name.trim()) {
      toast.error("Nama creative wajib diisi");
      return;
    }

    const metrics: Record<string, number> = {};
    if (newCreative.spend) metrics.spend = Number(newCreative.spend);
    if (newCreative.impressions) metrics.impressions = Number(newCreative.impressions);
    if (newCreative.clicks) metrics.clicks = Number(newCreative.clicks);
    if (newCreative.conversions) metrics.conversions = Number(newCreative.conversions);
    if (newCreative.ctr) metrics.ctr = Number(newCreative.ctr);
    if (newCreative.cpr) metrics.cpr = Number(newCreative.cpr);
    if (newCreative.roas) metrics.roas = Number(newCreative.roas);
    if (newCreative.frequency) metrics.frequency = Number(newCreative.frequency);

    try {
      const { error } = await supabase.from("creative_performance").insert({
        report_id: reportId,
        creative_name: newCreative.creative_name,
        creative_type: newCreative.creative_type,
        platform: newCreative.platform,
        metrics,
        status: "active",
        is_winner: false,
        notes: newCreative.notes || null,
      } as never);

      if (error) throw error;
      toast.success("Creative ditambahkan!");
      setNewCreative({
        creative_name: "", creative_type: "video", platform: "META",
        spend: "", impressions: "", clicks: "", conversions: "",
        ctr: "", cpr: "", roas: "", frequency: "", notes: "",
      });
      setShowForm(false);
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("creative_performance").delete().eq("id", id);
      if (error) throw error;
      toast.success("Creative dihapus");
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  async function toggleWinner(c: Creative) {
    try {
      // Unset other winners if setting new one
      if (!c.is_winner) {
        await supabase
          .from("creative_performance")
          .update({ is_winner: false } as never)
          .eq("report_id", reportId)
          .eq("is_winner", true);
      }
      const { error } = await supabase
        .from("creative_performance")
        .update({ is_winner: !c.is_winner } as never)
        .eq("id", c.id);
      if (error) throw error;
      toast.success(c.is_winner ? "Winner dihapus" : "👑 Creative Winner!");
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  async function cycleStatus(c: Creative) {
    const statuses = ["active", "paused", "under_review", "exhausted"];
    const currentIdx = statuses.indexOf(c.status);
    const nextStatus = statuses[(currentIdx + 1) % statuses.length];
    try {
      const { error } = await supabase
        .from("creative_performance")
        .update({ status: nextStatus } as never)
        .eq("id", c.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  function getScore(c: Creative): number {
    const m = c.metrics;
    let score = 0;
    if (m.roas) score += m.roas * 25;
    if (m.ctr) score += m.ctr * 10;
    if (m.conversions) score += Math.min(m.conversions, 50);
    if (m.cpr && m.cpr > 0) score -= Math.min(m.cpr / 1000, 10);
    return Math.round(score);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Load creative data...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-accent/5 to-primary/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <ImageIcon size={16} /> Creative Performance Tracker
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            <Plus size={12} /> Add Creative
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-3 space-y-2 rounded-md border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              placeholder="Nama creative (e.g. Video UGC #1)"
              value={newCreative.creative_name}
              onChange={(e) => setNewCreative({ ...newCreative, creative_name: e.target.value })}
              className="input text-xs"
            />
            <select
              value={newCreative.creative_type}
              onChange={(e) => setNewCreative({ ...newCreative, creative_type: e.target.value })}
              className="input text-xs"
            >
              {CREATIVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { key: "spend", label: "Spend", placeholder: "Rp" },
              { key: "impressions", label: "Impressions", placeholder: "0" },
              { key: "clicks", label: "Clicks", placeholder: "0" },
              { key: "conversions", label: "Conv", placeholder: "0" },
              { key: "ctr", label: "CTR %", placeholder: "0" },
              { key: "cpr", label: "CPR", placeholder: "Rp" },
              { key: "roas", label: "ROAS", placeholder: "0x" },
              { key: "frequency", label: "Freq", placeholder: "0" },
            ].map((f) => (
              <div key={f.key}>
                <label className="mb-0 block text-[9px] text-muted">{f.label}</label>
                <input
                  type="number"
                  step="any"
                  placeholder={f.placeholder}
                  value={(newCreative as Record<string, string>)[f.key]}
                  onChange={(e) => setNewCreative({ ...newCreative, [f.key]: e.target.value })}
                  className="input !py-1 text-[10px]"
                />
              </div>
            ))}
          </div>
          <input
            type="text"
            placeholder="Notes (opsional)"
            value={newCreative.notes}
            onChange={(e) => setNewCreative({ ...newCreative, notes: e.target.value })}
            className="input text-xs"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-gray-900">
              Batal
            </button>
            <button type="submit" className="rounded bg-primary px-3 py-1 text-xs text-white hover:opacity-90">
              Simpan
            </button>
          </div>
        </form>
      )}

      {creatives.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">
          Belum ada creative yang di-track. Klik "Add Creative" untuk mulai.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Winner badge */}
          {creatives.some((c) => c.is_winner) && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-warning/10 p-2 text-xs">
              <Crown size={14} className="text-warning" />
              <span className="font-semibold text-warning">
                Winner: {creatives.find((c) => c.is_winner)?.creative_name}
              </span>
            </div>
          )}

          {[...creatives]
            .sort((a, b) => getScore(b) - getScore(a))
            .map((c) => {
              const StatusIcon = STATUS_CONFIG[c.status]?.icon || Zap;
              const m = c.metrics;
              const score = getScore(c);

              return (
                <div
                  key={c.id}
                  className={cn(
                    "group rounded-md border bg-surface p-2 transition-all",
                    c.is_winner ? "border-warning/50 ring-1 ring-warning/30" : "border-border"
                  )}
                >
                  <div className="mb-1.5 flex items-start justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleWinner(c)}
                        className={cn(
                          "rounded p-0.5 transition-colors",
                          c.is_winner ? "text-warning" : "text-muted hover:text-warning"
                        )}
                        title="Tandai sebagai Winner"
                      >
                        <Crown size={12} />
                      </button>
                      <span className="text-xs font-medium text-gray-900">{c.creative_name}</span>
                      <span className="badge bg-primary/10 text-primary text-[8px] capitalize">{c.creative_type}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Performance Score */}
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-bold",
                        score >= 50 ? "bg-success/20 text-success" : score >= 20 ? "bg-warning/20 text-warning" : "bg-danger/20 text-danger"
                      )}>
                        Score: {score}
                      </span>
                      <button
                        onClick={() => cycleStatus(c)}
                        className={cn("flex items-center gap-0.5 text-[9px]", STATUS_CONFIG[c.status]?.color)}
                        title="Click untuk ganti status"
                      >
                        <StatusIcon size={10} /> {STATUS_CONFIG[c.status]?.label}
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Metrics inline */}
                  <div className="flex flex-wrap gap-2 text-[9px]">
                    {m.spend && <span className="text-muted">Spend: <b className="text-gray-900">{formatIDR(m.spend)}</b></span>}
                    {m.impressions && <span className="text-muted">Imp: <b className="text-gray-900">{formatCompact(m.impressions)}</b></span>}
                    {m.ctr !== undefined && <span className="text-muted">CTR: <b className="text-gray-900">{m.ctr}%</b></span>}
                    {m.conversions !== undefined && <span className="text-muted">Conv: <b className="text-gray-900">{m.conversions}</b></span>}
                    {m.cpr && m.cpr > 0 && <span className="text-muted">CPR: <b className="text-gray-900">{formatIDR(m.cpr)}</b></span>}
                    {m.roas !== undefined && (
                      <span className={cn("font-semibold", m.roas >= 3 ? "text-success" : m.roas >= 1 ? "text-warning" : "text-danger")}>
                        ROAS: {m.roas}x
                      </span>
                    )}
                  </div>

                  {c.notes && <p className="mt-1 text-[9px] italic text-muted">📝 {c.notes}</p>}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}