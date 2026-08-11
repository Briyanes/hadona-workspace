"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TrendingUp, TrendingDown, DollarSign, Users, AlertCircle } from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";

interface ClientProfit {
  id: string;
  name: string;
  status: string;
  contractValue: number;
  totalHours: number;
  laborCost: number;
  adSpend: number;
  totalCost: number;
  profit: number;
  margin: number;
}

export function ProfitabilityWidget() {
  const supabase = createClient();
  const [data, setData] = useState<ClientProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [avgMargin, setAvgMargin] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all active clients with contract values
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name, status, contract_value")
          .in("status", ["active", "onboarding"]);

        // Fetch timesheets grouped by client
        const { data: timesheets } = await supabase
          .from("timesheets")
          .select("client_id, hours, hourly_rate, billable");

        // Fetch ad spend (from report_metrics)
        const { data: metrics } = await supabase
          .from("report_metrics")
          .select("metric_type, value, report:weekly_reports(client_id)")
          .eq("metric_type", "spend");

        const clientList = (clients as unknown as { id: string; name: string; status: string; contract_value: number | null }[]) || [];
        const tsList = (timesheets as unknown as { client_id: string | null; hours: number; hourly_rate: number | null; billable: boolean }[]) || [];
        const metricList = (metrics as unknown as Array<{ metric_type: string; value: number | null; report: { client_id: string } | { client_id: string }[] }>) || [];

        // Calculate ad spend per client
        const adSpendPerClient: Record<string, number> = {};
        metricList.forEach((m) => {
          const cid = Array.isArray(m.report) ? m.report[0]?.client_id : m.report?.client_id;
          if (cid) {
            adSpendPerClient[cid] = (adSpendPerClient[cid] || 0) + (m.value || 0);
          }
        });

        // Calculate labor cost per client (assume avg rate of Rp 150,000/h if no rate)
        const DEFAULT_RATE = 150000;
        const hoursPerClient: Record<string, number> = {};
        const laborCostPerClient: Record<string, number> = {};

        tsList.forEach((t) => {
          if (!t.client_id) return;
          hoursPerClient[t.client_id] = (hoursPerClient[t.client_id] || 0) + t.hours;
          const rate = t.hourly_rate || DEFAULT_RATE;
          laborCostPerClient[t.client_id] = (laborCostPerClient[t.client_id] || 0) + t.hours * rate;
        });

        // Build profitability data
        const profitData: ClientProfit[] = clientList.map((c) => {
          const contractValue = c.contract_value || 0;
          const hours = hoursPerClient[c.id] || 0;
          const laborCost = laborCostPerClient[c.id] || 0;
          const adSpend = adSpendPerClient[c.id] || 0;
          const totalCost = laborCost + adSpend;
          const profit = contractValue - totalCost;
          const margin = contractValue > 0 ? (profit / contractValue) * 100 : 0;

          return {
            id: c.id,
            name: c.name,
            status: c.status,
            contractValue,
            totalHours: hours,
            laborCost,
            adSpend,
            totalCost,
            profit,
            margin,
          };
        });

        // Sort by profit descending
        profitData.sort((a, b) => b.profit - a.profit);

        setData(profitData);
        setTotalRevenue(profitData.reduce((s, c) => s + c.contractValue, 0));
        setTotalCost(profitData.reduce((s, c) => s + c.totalCost, 0));
        setTotalProfit(profitData.reduce((s, c) => s + c.profit, 0));
        setAvgMargin(
          profitData.length > 0
            ? profitData.reduce((s, c) => s + c.margin, 0) / profitData.length
            : 0
        );
      } catch (err) {
        console.error("Profitability widget error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton mb-4 h-6 w-48 rounded" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return null;
  }

  const summaryCards = [
    {
      label: "Total Revenue",
      value: formatIDR(totalRevenue),
      sub: "Contract values",
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Cost",
      value: formatIDR(totalCost),
      sub: "Labor + Ads",
      icon: AlertCircle,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Net Profit",
      value: formatIDR(totalProfit),
      sub: totalProfit >= 0 ? "Surplus" : "Deficit",
      icon: totalProfit >= 0 ? TrendingUp : TrendingDown,
      color: totalProfit >= 0 ? "text-success" : "text-danger",
      bg: totalProfit >= 0 ? "bg-success/10" : "bg-danger/10",
    },
    {
      label: "Avg Margin",
      value: `${avgMargin.toFixed(1)}%`,
      sub: avgMargin >= 30 ? "Healthy" : avgMargin >= 0 ? "Low" : "Loss",
      icon: Users,
      color: avgMargin >= 30 ? "text-success" : avgMargin >= 0 ? "text-warning" : "text-danger",
      bg: avgMargin >= 30 ? "bg-success/10" : avgMargin >= 0 ? "bg-warning/10" : "bg-danger/10",
    },
  ];

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Client Profitability</h2>
          <p className="text-xs text-muted">Revenue vs Cost per client (monthly)</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-border bg-background p-3">
              <div className={cn("mb-2 inline-flex rounded-lg p-1.5", card.bg)}>
                <Icon className={card.color} size={14} />
              </div>
              <p className="text-[10px] uppercase text-muted">{card.label}</p>
              <p className={cn("mt-0.5 text-base font-bold", card.color)}>{card.value}</p>
              <p className="text-[10px] text-muted">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Per-client breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 pr-3">Client</th>
              <th className="pb-2 pr-3 text-right">Revenue</th>
              <th className="pb-2 pr-3 text-right">Labor</th>
              <th className="pb-2 pr-3 text-right">Ads</th>
              <th className="pb-2 pr-3 text-right">Profit</th>
              <th className="pb-2 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 8).map((c) => (
              <tr key={c.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3">
                  <span className="font-medium text-foreground">{c.name}</span>
                </td>
                <td className="py-2 pr-3 text-right text-muted">{formatIDR(c.contractValue)}</td>
                <td className="py-2 pr-3 text-right text-muted">{c.laborCost > 0 ? formatIDR(c.laborCost) : "—"}</td>
                <td className="py-2 pr-3 text-right text-muted">{c.adSpend > 0 ? formatIDR(c.adSpend) : "—"}</td>
                <td className={cn("py-2 pr-3 text-right font-semibold", c.profit >= 0 ? "text-success" : "text-danger")}>
                  {formatIDR(c.profit)}
                </td>
                <td className="py-2 text-right">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                      c.margin >= 30
                        ? "bg-success/10 text-success"
                        : c.margin >= 0
                          ? "bg-warning/10 text-warning"
                          : "bg-danger/10 text-danger"
                    )}
                  >
                    {c.margin.toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 8 && (
        <p className="mt-2 text-center text-xs text-muted">
          + {data.length - 8} client lainnya
        </p>
      )}
    </div>
  );
}