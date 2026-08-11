"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthData {
  summary: {
    total: number;
    atRisk: number;
    needsAttention: number;
    healthy: number;
  };
  atRiskClients: Array<{
    id: string;
    name: string;
    health_score: number;
    status: string;
  }>;
  needsAttentionClients: Array<{
    id: string;
    name: string;
    health_score: number;
    status: string;
  }>;
}

export function ClientHealthWidget() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/client-health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (d && d.summary) {
          setData(d);
        }
      })
      .catch(() => {
        // Silent fail — widget just won't show
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-32" />
      </Card>
    );
  }

  if (!data) return null;

  const { summary } = data;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-rose-500" />
          <h3 className="font-semibold text-sm">Client Health Score</h3>
        </div>
        <Link href="/clients" className="text-xs text-primary hover:underline">
          View All
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <span className="text-[10px] font-medium uppercase text-rose-600 dark:text-rose-400">At Risk</span>
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{summary.atRisk}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400">Attention</span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.needsAttention}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-medium uppercase text-emerald-600 dark:text-emerald-400">Healthy</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.healthy}</p>
        </div>
      </div>

      {/* At-Risk Client List */}
      {data.atRiskClients.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted/60">Needs Immediate Attention</p>
          {data.atRiskClients.slice(0, 3).map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-2 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
                <span className="text-sm font-medium truncate max-w-[140px]">{c.name}</span>
              </div>
              <span className="text-xs font-bold text-rose-500">
                {c.health_score?.toFixed(0)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {data.atRiskClients.length === 0 && data.needsAttentionClients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <TrendingUp className="h-8 w-8 text-emerald-500 mb-2" />
          <p className="text-sm text-muted">All clients are healthy!</p>
        </div>
      )}
    </Card>
  );
}
