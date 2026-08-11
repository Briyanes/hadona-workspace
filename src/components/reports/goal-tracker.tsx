"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Target, Plus, Trash2, Loader2, TrendingUp, TrendingDown, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatIDR, formatCompact, cn, extractError } from "@/lib/utils";

interface Goal {
  id: string;
  client_id: string;
  goal_type: "roas" | "cpa" | "spend" | "conversions" | "ctr" | "cpr";
  target_value: number;
  period_type: "weekly" | "monthly" | "quarterly";
  period_start: string;
  period_end: string;
  is_active: boolean;
  notes: string | null;
}

interface ActualMetrics {
  roas?: number;
  cpa?: number;
  spend?: number;
  conversions?: number;
  ctr?: number;
  cpr?: number;
}

const GOAL_LABELS: Record<string, { label: string; unit: "currency" | "number" | "percent" | "ratio"; desc: string }> = {
  roas: { label: "ROAS Target", unit: "ratio", desc: "Target Return on Ad Spend (x)" },
  cpa: { label: "CPA Target", unit: "currency", desc: "Target Cost Per Acquisition" },
  spend: { label: "Budget Spend", unit: "currency", desc: "Target/Max budget iklan" },
  conversions: { label: "Conversions", unit: "number", desc: "Target jumlah konversi" },
  ctr: { label: "CTR Target", unit: "percent", desc: "Target Click-Through Rate" },
  cpr: { label: "CPR Target", unit: "currency", desc: "Target Cost Per Result" },
};

function formatGoal(value: number, unit: string): string {
  switch (unit) {
    case "currency": return formatIDR(value);
    case "percent": return `${value}%`;
    case "ratio": return `${value}x`;
    default: return formatCompact(value);
  }
}

// Hitung progress percentage & color
function getProgress(actual: number | undefined, target: number, goalType: string) {
  if (actual === undefined || actual === 0 || target === 0) return null;
  
  // Higher is better: roas, conversions, ctr
  // Lower is better: cpa, cpr, spend
  const higherIsBetter = goalType === "roas" || goalType === "conversions" || goalType === "ctr";
  
  const pct = higherIsBetter ? (actual / target) * 100 : (target / actual) * 100;
  const clamped = Math.min(pct, 999);
  
  let color = "text-danger";
  let bg = "bg-danger";
  let status = "off-track";
  
  if (clamped >= 90) { color = "text-success"; bg = "bg-success"; status = "on-track"; }
  else if (clamped >= 60) { color = "text-warning"; bg = "bg-warning"; status = "at-risk"; }
  
  return { pct: clamped, color, bg, status, higherIsBetter };
}

export function GoalTracker({ clientId, actualMetrics }: { clientId: string; actualMetrics?: ActualMetrics }) {
  const supabase = createClient();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newGoal, setNewGoal] = useState({
    goal_type: "roas" as Goal["goal_type"],
    target_value: "",
    period_type: "monthly" as Goal["period_type"],
  });

  const loadGoals = useCallback(async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("client_goals")
        .select("*")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .lte("period_start", today)
        .gte("period_end", today)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setGoals((data as unknown as Goal[]) || []);
    } catch (err) {
      // Silent fail - goals optional
      console.error("GoalTracker load error:", extractError(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, clientId]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!newGoal.target_value || Number(newGoal.target_value) <= 0) {
      toast.error("Target value harus > 0");
      return;
    }

    // Hitung periode berdasarkan period_type (snap ke natural boundaries)
    const now = new Date();
    let periodStart = new Date(now);
    let periodEnd = new Date(now);

    if (newGoal.period_type === "weekly") {
      // Snap ke Senin (ISO week: Senin-Minggu)
      const dayOfWeek = now.getDay(); // 0=Min, 1=Sen, ..., 6=Sab
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() + diffToMonday);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6); // Minggu
    } else if (newGoal.period_type === "monthly") {
      // Awal sampai akhir bulan berjalan
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (newGoal.period_type === "quarterly") {
      // Awal sampai akhir quarter berjalan (Q1=Jan-Mar, Q2=Apr-Jun, dst)
      const currentQuarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
      periodEnd = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0);
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_goals").insert({
        client_id: clientId,
        goal_type: newGoal.goal_type,
        target_value: Number(newGoal.target_value),
        period_type: newGoal.period_type,
        period_start: periodStart.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        is_active: true,
        created_by: userData.user?.id,
      } as never);

      if (error) throw error;
      toast.success("✅ Goal ditambahkan!");
      setNewGoal({ ...newGoal, target_value: "" });
      setShowForm(false);
      loadGoals();
    } catch (err) {
      toast.error("Gagal: " + extractError(err));
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from("client_goals").delete().eq("id", id);
      if (error) throw error;
      toast.success("Goal dihapus");
      loadGoals();
    } catch (err) {
      toast.error("Gagal hapus: " + extractError(err));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Load goals...
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted">
          <Target size={12} /> Goal Tracking
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <Plus size={10} /> Add Goal
          </button>
        )}
      </div>

      {/* Add Goal Form */}
      {showForm && (
        <form onSubmit={handleAddGoal} className="mb-3 rounded-md border border-border bg-surface p-2">
          <div className="grid grid-cols-3 gap-2">
            <select
              value={newGoal.goal_type}
              onChange={(e) => setNewGoal({ ...newGoal, goal_type: e.target.value as Goal["goal_type"] })}
              className="input !py-1 text-xs"
            >
              {Object.entries(GOAL_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              required
              placeholder="Target"
              value={newGoal.target_value}
              onChange={(e) => setNewGoal({ ...newGoal, target_value: e.target.value })}
              className="input !py-1 text-xs"
            />
            <select
              value={newGoal.period_type}
              onChange={(e) => setNewGoal({ ...newGoal, period_type: e.target.value as Goal["period_type"] })}
              className="input !py-1 text-xs"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <p className="mt-1 text-[9px] text-muted">{GOAL_LABELS[newGoal.goal_type].desc}</p>
          <div className="mt-2 flex justify-end gap-1">
            <button type="button" onClick={() => setShowForm(false)} className="text-[10px] text-muted hover:text-foreground">
              Batal
            </button>
            <button type="submit" className="rounded bg-primary px-2 py-1 text-[10px] text-white hover:opacity-90">
              Simpan Goal
            </button>
          </div>
        </form>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <p className="text-center text-[10px] text-muted">
          Belum ada goal aktif. Klik "Add Goal" untuk set target performa.
        </p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const meta = GOAL_LABELS[g.goal_type];
            const actual = actualMetrics?.[g.goal_type];
            const progress = getProgress(actual, g.target_value, g.goal_type);
            
            return (
              <div key={g.id} className="group rounded-md border border-border bg-surface p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-muted">{meta.label}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-muted uppercase">{g.period_type}</span>
                    <button
                      onClick={() => handleDelete(g.id)}
                      className="text-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                
                {/* Progress bar */}
                {progress ? (
                  <>
                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-background">
                      <div
                        className={cn("h-full rounded-full transition-all", progress.bg)}
                        style={{ width: `${Math.min(progress.pct, 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-between px-2 text-[9px] font-bold text-white">
                        <span>{formatGoal(actual!, meta.unit)}</span>
                        <span>/ {formatGoal(g.target_value, meta.unit)}</span>
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px]">
                      <span className={cn("flex items-center gap-0.5 font-semibold", progress.color)}>
                        {progress.status === "on-track" ? <CheckCircle size={9} /> : <AlertCircle size={9} />}
                        {progress.status === "on-track" ? "On Track" : progress.status === "at-risk" ? "At Risk" : "Off Track"}
                      </span>
                      <span className="text-muted">{progress.pct.toFixed(0)}% achieved</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between rounded bg-background px-2 py-1 text-[10px]">
                    <span className="text-muted">Target: <b className="text-foreground">{formatGoal(g.target_value, meta.unit)}</b></span>
                    <span className="text-muted italic">Belum ada aktual</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}