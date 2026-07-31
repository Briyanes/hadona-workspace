"use client";

import {
  MetricKey,
  OBJECTIVE_MAP,
  METRIC_LABELS,
  formatMetricValue,
  getMetricHealth,
} from "@/lib/ad-objectives";
import { TrendingUp, TrendingDown, Minus, ArrowRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  metric: MetricKey;
  value: number | null | undefined;
  previousValue?: number | null;
  objectiveId: string;
  size?: "hero" | "compact";
}

const HEALTH_COLORS = {
  good: "text-success border-success/20 bg-success/5",
  warning: "text-warning border-warning/20 bg-warning/5",
  danger: "text-danger border-danger/20 bg-danger/5",
  neutral: "text-gray-900 border-border bg-surface",
};

function HealthBadge({ health }: { health: keyof typeof HEALTH_COLORS }) {
  const labels = { good: "Healthy", warning: "Watch", danger: "Critical", neutral: "—" };
  if (health === "neutral") return null;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-semibold", HEALTH_COLORS[health])}>
      {labels[health]}
    </span>
  );
}

function WoWIndicator({ current, previous }: { current: number | null; previous?: number | null }) {
  if (previous === undefined || previous === null || previous === 0 || current === null) {
    return null;
  }

  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 1;

  // Determine if change is good or bad
  // For cost metrics, down is good. For others, up is good.
  const isPositive = isFlat ? null : isUp;

  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[9px] font-medium",
        isFlat ? "text-muted" : isPositive ? "text-success" : "text-danger"
      )}
      title={`WoW: ${previous.toLocaleString("id-ID")} → ${current.toLocaleString("id-ID")}`}
    >
      {isFlat ? <Minus size={8} /> : isPositive ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
      {isFlat ? "0%" : `${isPositive ? "+" : ""}${change.toFixed(1)}%`}
    </span>
  );
}

export function KPICard({ metric, value, previousValue, objectiveId, size = "compact" }: KPICardProps) {
  const label = METRIC_LABELS[metric] || metric;
  const health = getMetricHealth(objectiveId, metric, value);
  const isHero = size === "hero";

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-all hover:shadow-sm",
        HEALTH_COLORS[health],
        isHero ? "min-w-[140px]" : "min-w-[110px]"
      )}
    >
      <div className="mb-0.5 flex items-center justify-between gap-1">
        <p className="truncate text-[9px] font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <HealthBadge health={health} />
      </div>
      <p className={cn("font-bold text-gray-900", isHero ? "text-lg" : "text-sm")}>
        {formatMetricValue(metric, value)}
      </p>
      <div className="mt-0.5">
        <WoWIndicator current={value ?? null} previous={previousValue} />
      </div>
    </div>
  );
}

// ============================================================================
// FUNNEL VISUALIZATION
// ============================================================================

interface FunnelStep {
  metric: MetricKey;
  label: string;
  value: number | null;
  previousValue?: number | null;
}

function FunnelBar({ step, maxValue }: { step: FunnelStep; maxValue: number }) {
  const percent = maxValue > 0 && step.value ? Math.max(2, (step.value / maxValue) * 100) : 0;
  const displayValue = step.value ? step.value.toLocaleString("id-ID") : "—";

  return (
    <div className="flex items-center gap-2">
      <div className="w-28 truncate text-right text-[9px] text-muted">{step.label}</div>
      <div className="relative h-6 flex-1 rounded bg-gray-100">
        <div
          className="absolute inset-y-0 left-0 rounded bg-primary/70 transition-all"
          style={{ width: `${percent}%` }}
        />
        <span className="absolute inset-y-0 right-2 flex items-center text-[9px] font-semibold text-gray-900">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

export function FunnelVisualization({
  steps,
  ratios,
  metrics,
  previousMetrics,
}: {
  steps: MetricKey[];
  ratios?: MetricKey[];
  metrics: Record<string, number | null>;
  previousMetrics?: Record<string, number | null>;
}) {
  const stepData: FunnelStep[] = steps.map((metric) => ({
    metric,
    label: METRIC_LABELS[metric] || metric,
    value: metrics[metric] ?? null,
    previousValue: previousMetrics?.[metric],
  }));

  const maxValue = Math.max(...stepData.map((s) => s.value || 0), 1);

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-900">
        <Filter size={12} /> Conversion Funnel
      </p>
      <div className="space-y-1.5">
        {stepData.map((step, idx) => (
          <div key={step.metric}>
            <FunnelBar step={step} maxValue={maxValue} />
            {idx < stepData.length - 1 && stepData[idx + 1]?.value && step.value && (
              <div className="my-0.5 flex items-center gap-2 pl-28 text-[8px] text-muted">
                <ArrowRight size={8} />
                {(((stepData[idx + 1]?.value ?? 0) / step.value) * 100).toFixed(1)}% drop-off
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ratios */}
      {ratios && ratios.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="mb-1 text-[8px] font-semibold uppercase text-muted">Conversion Ratios</p>
          <div className="flex flex-wrap gap-1.5">
            {ratios.map((ratio) => (
              <span key={ratio} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary">
                {METRIC_LABELS[ratio] || ratio}: {formatMetricValue(ratio, metrics[ratio])}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// OBJECTIVE-AWARE KPI BAR (Main Component)
// ============================================================================

interface KPIBarProps {
  objectiveId: string;
  metrics: Record<string, number | null>;
  previousMetrics?: Record<string, number | null>;
  className?: string;
}

export function ObjectiveKPIBar({ objectiveId, metrics, previousMetrics, className }: KPIBarProps) {
  const obj = OBJECTIVE_MAP[objectiveId];

  if (!obj) {
    // Fallback: show generic metrics
    return (
      <div className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
        {Object.entries(metrics).slice(0, 6).map(([key, value]) => (
          <KPICard
            key={key}
            metric={key as MetricKey}
            value={value}
            objectiveId="GENERIC"
            previousValue={previousMetrics?.[key]}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Hero KPI Bar — Primary metrics dengan size besar */}
      <div>
        <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted">
          {obj.icon} {obj.label} — Primary KPIs
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {obj.primaryMetrics.map((metric) => (
            <KPICard
              key={metric}
              metric={metric}
              value={metrics[metric]}
              objectiveId={objectiveId}
              previousValue={previousMetrics?.[metric]}
              size="hero"
            />
          ))}
        </div>
      </div>

      {/* Secondary metrics — compact bar */}
      {obj.secondaryMetrics.length > 0 && (
        <div>
          <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted">Secondary Metrics</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {obj.secondaryMetrics.slice(0, 10).map((metric) => (
              <KPICard
                key={metric}
                metric={metric}
                value={metrics[metric]}
                objectiveId={objectiveId}
                previousValue={previousMetrics?.[metric]}
              />
            ))}
          </div>
        </div>
      )}

      {/* Funnel visualization jika ada */}
      {obj.funnelMetrics && obj.funnelMetrics.steps.length > 0 && (
        <FunnelVisualization
          steps={obj.funnelMetrics.steps}
          ratios={obj.funnelMetrics.ratios}
          metrics={metrics}
          previousMetrics={previousMetrics}
        />
      )}
    </div>
  );
}