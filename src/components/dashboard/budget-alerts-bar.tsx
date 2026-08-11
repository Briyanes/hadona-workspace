"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, TrendingUp, DollarSign, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetAlert {
  id: string;
  client_id: string | null;
  ad_account_id: string | null;
  threshold_pct: number;
  current_spend: number;
  monthly_budget: number;
  alert_type: string;
  message: string | null;
  is_acknowledged: boolean;
  created_at: string;
  client?: { name: string };
}

export function BudgetAlertsBar() {
  const supabase = createClient();
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel("budget-alerts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "budget_alerts" }, () => loadAlerts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function loadAlerts() {
    try {
      const { data, error } = await supabase
        .from("budget_alerts")
        .select(`id, client_id, ad_account_id, threshold_pct, current_spend, monthly_budget, alert_type, message, is_acknowledged, created_at, client:clients(name)`)
        .eq("is_acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        // Table might not exist yet — silently fail
        console.warn("[BudgetAlerts] Failed to load:", error.message);
        setAlerts([]);
      } else {
        setAlerts((data as unknown as BudgetAlert[]) || []);
      }
    } catch (err) {
      // Silently fail - alerts are non-critical
      console.warn("[BudgetAlerts] Error:", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  async function acknowledge(alertId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("budget_alerts")
      .update({
        is_acknowledged: true,
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
      } as never)
      .eq("id", alertId);

    if (error) {
      toast.error("Gagal acknowledge alert");
      return;
    }

    toast.success("Alert di-acknowledge");
    loadAlerts();
  }

  if (loading || alerts.length === 0) return null;

  const alertConfig: Record<string, { icon: typeof Info; bg: string; border: string; text: string }> = {
    info: { icon: Info, bg: "bg-primary/5", border: "border-primary/30", text: "text-primary" },
    warning: { icon: AlertTriangle, bg: "bg-warning/5", border: "border-warning/30", text: "text-warning" },
    critical: { icon: AlertTriangle, bg: "bg-danger/5", border: "border-danger/30", text: "text-danger" },
    overspend: { icon: TrendingUp, bg: "bg-danger/10", border: "border-danger/50", text: "text-danger" },
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const config = alertConfig[alert.alert_type] || alertConfig.warning;
        const Icon = config.icon;
        const pct = alert.monthly_budget > 0 ? Math.round((alert.current_spend / alert.monthly_budget) * 100) : 0;

        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              config.bg,
              config.border
            )}
          >
            <Icon size={18} className={cn("shrink-0", config.text)} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {alert.client?.name || "Unknown Client"}
                </span>
                <span className={cn("text-xs font-bold", config.text)}>
                  {pct}%
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span className="flex items-center gap-0.5">
                  <DollarSign size={10} />
                  {alert.current_spend.toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 })}
                </span>
                <span>/</span>
                <span>
                  {alert.monthly_budget.toLocaleString("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 })}
                </span>
                {alert.message && (
                  <>
                    <span>•</span>
                    <span className="truncate">{alert.message}</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => acknowledge(alert.id)}
              className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-background hover:text-foreground"
              title="Acknowledge"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}