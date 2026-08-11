"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatIDR, formatCompact } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Calendar } from "lucide-react";

// ============================================
// TYPES (match dengan parent)
// ============================================
interface ReportMetric {
  id: string;
  metric_type: string;
  value: number | null;
  previous_value: number | null;
}

interface Report {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  status: string;
  objective?: string | null;
  client?: { name: string };
  report_metrics?: ReportMetric[];
}

interface Client {
  id: string;
  name: string;
}

// ============================================
// METRIC DEFS (subset yang relevan untuk comparison)
// ============================================
const COMPARE_METRICS: Array<{
  key: string;
  label: string;
  unit: "currency" | "number" | "percent" | "ratio";
}> = [
  { key: "spend", label: "Spend", unit: "currency" },
  { key: "impressions", label: "Impressions", unit: "number" },
  { key: "clicks", label: "Clicks", unit: "number" },
  { key: "ctr", label: "CTR", unit: "percent" },
  { key: "conversions", label: "Conversions", unit: "number" },
  { key: "cpr", label: "CPR", unit: "currency" },
  { key: "revenue", label: "Revenue", unit: "currency" },
  { key: "roas", label: "ROAS", unit: "ratio" },
];

// ============================================
// HELPERS
// ============================================
function fmt(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  switch (unit) {
    case "currency":
      return formatIDR(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "number":
      return formatCompact(value);
    default:
      return String(value);
  }
}

function calcDelta(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function deltaColor(delta: number | null, metricKey: string): string {
  if (delta === null) return "text-muted";
  // Untuk CPR & spend, naik = buruk (merah)
  const inverseMetrics = ["cpr", "cpc", "cpm", "spend"];
  const isInverted = inverseMetrics.includes(metricKey);

  if (delta > 0) return isInverted ? "text-danger" : "text-success";
  if (delta < 0) return isInverted ? "text-success" : "text-danger";
  return "text-muted";
}

// ============================================
// MAIN COMPONENT
// ============================================
export function CompareView({
  reports,
  clients,
}: {
  reports: Report[];
  clients: Client[];
}) {
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [weekCount, setWeekCount] = useState<number>(4);
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  // Filter & sort reports by client + period + objective
  const comparisonData = useMemo(() => {
    const filtered = reports.filter((r) => {
      const matchClient = selectedClient === "all" || r.client_id === selectedClient;
      const matchObjective =
        objectiveFilter === "all" ||
        (objectiveFilter === "none" && !r.objective) ||
        r.objective === objectiveFilter;
      return matchClient && matchObjective;
    });

    // Sort by period_start ascending, ambil N minggu terakhir
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(a.period_start).getTime() -
        new Date(b.period_start).getTime()
    );

    // Group by client (untuk mode "all clients")
    const byClient = new Map<string, Report[]>();
    sorted.forEach((r) => {
      const arr = byClient.get(r.client_id) || [];
      arr.push(r);
      byClient.set(r.client_id, arr);
    });

    // Ambil N minggu terakhir per client
    const result: Array<{
      clientId: string;
      clientName: string;
      weeks: Array<{
        report: Report;
        metrics: Record<string, number>;
      }>;
    }> = [];

    byClient.forEach((clientReports, clientId) => {
      const recentWeeks = clientReports.slice(-weekCount);
      const weeks = recentWeeks.map((report) => {
        const metricMap: Record<string, number> = {};
        (report.report_metrics || []).forEach((m) => {
          const existing = metricMap[m.metric_type] || 0;
          metricMap[m.metric_type] = existing + (m.value || 0);
        });
        return { report, metrics: metricMap };
      });
      result.push({
        clientId,
        clientName: weeks[0]?.report.client?.name || "Unknown",
        weeks,
      });
    });

    return result;
  }, [reports, selectedClient, weekCount, objectiveFilter]);

  // ─── Aggregate totals per metric (cross-client) ───
  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    comparisonData.forEach((c) => {
      c.weeks.forEach((w) => {
        Object.entries(w.metrics).forEach(([key, val]) => {
          acc[key] = (acc[key] || 0) + val;
        });
      });
    });
    return acc;
  }, [comparisonData]);

  const totalSpend = totals.spend || 0;
  const totalRevenue = totals.revenue || 0;
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Client</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="input w-auto"
          >
            <option value="all">Semua Client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Jumlah Minggu</label>
          <select
            value={weekCount}
            onChange={(e) => setWeekCount(Number(e.target.value))}
            className="input w-auto"
          >
            <option value={4}>4 Minggu</option>
            <option value={6}>6 Minggu</option>
            <option value={8}>8 Minggu</option>
            <option value={12}>12 Minggu</option>
          </select>
        </div>
        {/* B11: Objective Filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Objective</label>
          <select
            value={objectiveFilter}
            onChange={(e) => setObjectiveFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">Semua Objective</option>
            <option value="none">⚠️ Tanpa Objective</option>
            <optgroup label="🔵 Meta">
              <option value="META_CPAS">🛒 CPAS</option>
              <option value="META_CTWA">💬 CTWA</option>
              <option value="META_CTLP">🌐 CTLP</option>
              <option value="META_TRAFFIC">🚦 Traffic</option>
              <option value="META_SALES">💰 Sales</option>
              <option value="META_LEAD_GEN">📋 Lead Gen</option>
              <option value="META_AWARENESS">👁️ Awareness</option>
              <option value="META_MESSAGES">📨 Messages</option>
              <option value="META_ENGAGEMENT">❤️ Engagement</option>
              <option value="META_VIDEO_VIEWS">🎬 Video Views</option>
              <option value="META_APP_INSTALLS">📱 App Installs</option>
            </optgroup>
            <optgroup label="🟢 Google">
              <option value="GOOGLE_GDN">📊 GDN</option>
              <option value="GOOGLE_DEMAND_GEN">⚡ Demand Gen</option>
              <option value="GOOGLE_SEARCH">🔍 Search</option>
              <option value="GOOGLE_PMAX">🚀 PMax</option>
              <option value="GOOGLE_YOUTUBE">▶️ YouTube</option>
              <option value="GOOGLE_SHOPPING">🛍️ Shopping</option>
            </optgroup>
            <optgroup label="🔴 TikTok">
              <option value="TIKTOK_GMX_MAX">📈 GMX Max</option>
              <option value="TIKTOK_WEB_CONV">💻 Web Conv</option>
              <option value="TIKTOK_REACH">📡 Reach</option>
              <option value="TIKTOK_VIDEO_VIEWS">🎥 Video Views</option>
              <option value="TIKTOK_COMMUNITY">👥 Community</option>
            </optgroup>
          </select>
        </div>
        {/* Quick summary */}
        <div className="ml-auto flex gap-3">
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-[9px] text-muted">TOTAL SPEND</p>
            <p className="text-sm font-bold text-foreground">{formatIDR(totalSpend)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-[9px] text-muted">OVERALL ROAS</p>
            <p className={cn("text-sm font-bold", overallRoas >= 3 ? "text-success" : overallRoas >= 1 ? "text-warning" : "text-danger")}>
              {overallRoas > 0 ? `${overallRoas.toFixed(2)}x` : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {comparisonData.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada data report untuk comparison</p>
        </div>
      ) : (
        /* Matrix per client */
        <div className="space-y-6">
          {comparisonData.map((client) => {
            if (client.weeks.length === 0) return null;

            return (
              <div key={client.clientId} className="card overflow-hidden">
                <div className="border-b border-border bg-background px-4 py-3">
                  <h3 className="font-semibold text-foreground">{client.clientName}</h3>
                  <p className="text-xs text-muted">
                    {client.weeks.length} minggu •{" "}
                    {formatDate(client.weeks[0].report.period_start, { day: "numeric", month: "short" })} —{" "}
                    {formatDate(client.weeks[client.weeks.length - 1].report.period_end, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-background">
                        <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-semibold text-muted">
                          Metrik
                        </th>
                        {client.weeks.map((w, i) => (
                          <th
                            key={w.report.id}
                            className="px-3 py-2 text-right font-semibold text-muted"
                          >
                            <div className="flex flex-col items-end">
                              <span>W{i + 1}</span>
                              <span className="text-[9px] font-normal">
                                {formatDate(w.report.period_start, { day: "numeric", month: "short" })}
                              </span>
                            </div>
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right font-semibold text-muted">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COMPARE_METRICS.map((metricDef) => {
                        const values = client.weeks.map((w) => w.metrics[metricDef.key] || 0);
                        const hasData = values.some((v) => v > 0);
                        if (!hasData) return null;

                        // Hitung trend (first vs last)
                        const first = values[0];
                        const last = values[values.length - 1];
                        const trendDelta = calcDelta(last, first || null);
                        const trendColor = deltaColor(trendDelta, metricDef.key);

                        return (
                          <tr key={metricDef.key} className="border-b border-border last:border-0 hover:bg-background/50">
                            <td className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-muted">
                              {metricDef.label}
                            </td>
                            {values.map((val, i) => {
                              // WoW delta vs minggu sebelumnya
                              const prev = i > 0 ? values[i - 1] : null;
                              const wowDelta = i > 0 ? calcDelta(val, prev || null) : null;

                              return (
                                <td key={i} className="px-3 py-2 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-semibold text-foreground">
                                      {fmt(val, metricDef.unit)}
                                    </span>
                                    {wowDelta !== null && Math.abs(wowDelta) > 0.1 && (
                                      <span
                                        className={cn(
                                          "flex items-center gap-0.5 text-[8px]",
                                          deltaColor(wowDelta, metricDef.key)
                                        )}
                                      >
                                        {wowDelta > 0 ? (
                                          <TrendingUp size={7} />
                                        ) : wowDelta < 0 ? (
                                          <TrendingDown size={7} />
                                        ) : (
                                          <Minus size={7} />
                                        )}
                                        {wowDelta > 0 ? "+" : ""}
                                        {wowDelta.toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            {/* Trend summary column */}
                            <td className="px-3 py-2 text-right">
                              {trendDelta !== null && (
                                <span className={cn("flex items-center justify-end gap-0.5 text-[10px] font-bold", trendColor)}>
                                  {trendDelta > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                  {trendDelta > 0 ? "+" : ""}
                                  {trendDelta.toFixed(0)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-lg border border-border bg-background p-3 text-[10px] text-muted">
        <p className="mb-1 font-semibold uppercase">Cara Baca:</p>
        <ul className="space-y-0.5">
          <li>• 🟢 Hijau = trend naik (positif untuk performa, negatif untuk spend/cost)</li>
          <li>• 🔴 Merah = trend turun (negatif untuk performa, positif untuk spend/cost)</li>
          <li>• WoW % = perubahan vs minggu sebelumnya</li>
          <li>• Trend = perubahan dari minggu pertama ke minggu terakhir</li>
        </ul>
      </div>
    </div>
  );
}