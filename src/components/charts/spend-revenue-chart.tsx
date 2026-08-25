"use client";

import { useId, type ReactNode } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * SpendRevenueChart — reusable Spend vs Revenue area chart (recharts)
 *
 * Di-load via next/dynamic ({ ssr: false }) agar bundle recharts tidak
 * masuk initial payload halaman. Struktural (tanpa index signature)
 * agar menerima TrendData[] maupun inline object types.
 *
 * Usage:
 *   const SpendRevenueChart = dynamic(
 *     () => import("@/components/charts/spend-revenue-chart").then((m) => m.SpendRevenueChart),
 *     { ssr: false }
 *   );
 *   <SpendRevenueChart data={trendData} xKey="date" formatValue={formatIDR} />
 */

interface SpendRevenueChartProps {
  /** Data points — minimal punya properti spend & revenue (key X bebas via xKey) */
  data: { spend: number; revenue: number }[];
  /** Key untuk sumbu X (mis. "date" atau "period") */
  xKey: string;
  /** Tinggi chart dalam px (default 220) */
  height?: number;
  /** Interval tick X — selisih antar label (default 0 = tampilkan semua) */
  xInterval?: number;
  /** Lebar area tick Y (default 40) */
  yWidth?: number;
  /** Formatter nilai untuk tooltip (default: toLocaleString id-ID) */
  formatValue?: (value: number) => string;
  /** Override deteksi data kosong (mis. hanya cek total spend === 0) */
  isEmpty?: boolean;
  /** Node yang dirender ketika data kosong */
  empty?: ReactNode;
  /** Tampilkan legend dot Spend/Revenue (default false) */
  showLegend?: boolean;
}

/** Warna standar dashboard: Spend = amber, Revenue = green */
const SPEND_COLOR = "#f59e0b";
const REVENUE_COLOR = "#10b981";

export function SpendRevenueChart({
  data,
  xKey,
  height = 220,
  xInterval = 0,
  yWidth = 40,
  formatValue = (v) => v.toLocaleString("id-ID"),
  isEmpty,
  empty,
  showLegend = false,
}: SpendRevenueChartProps) {
  // ID unik per instance agar gradient tidak bentrok bila >1 chart dirender bersamaan
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const hasNoData = isEmpty ?? data.every((d) => !d.spend && !d.revenue);

  if (hasNoData && empty) {
    return <>{empty}</>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spendFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SPEND_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={SPEND_COLOR} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`revenueFill-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={REVENUE_COLOR} stopOpacity={0.3} />
              <stop offset="95%" stopColor={REVENUE_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            interval={xInterval}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            axisLine={false}
            tickLine={false}
            width={yWidth}
          />
          <Tooltip
            formatter={(value) => [formatValue(Number(value))]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            stroke={SPEND_COLOR}
            strokeWidth={2}
            fill={`url(#spendFill-${uid})`}
            name="Spend"
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={REVENUE_COLOR}
            strokeWidth={2}
            fill={`url(#revenueFill-${uid})`}
            name="Revenue"
          />
        </AreaChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="mt-3 flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-2 w-2 rounded-full bg-warning" /> Spend
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-2 w-2 rounded-full bg-success" /> Revenue
          </span>
        </div>
      )}
    </div>
  );
}