"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Users, Zap } from 'lucide-react';
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

interface DivisionStat {
  name: string;
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  overdue: number;
  members: number;
}

interface DivisionAnalyticsWidgetProps {
  initialData?: DivisionStat[];
}

const divisionLabels: Record<string, string> = {
  content_creator: "Content Creator",
  production: "Production",
  project_manager: "Project Manager",
  advertiser: "Advertiser",
  creative_director: "Creative Director",
  account_manager: "Account Manager",
  designer: "Designer",
  copywriter: "Copywriter",
  videographer: "Videographer",
  social_media: "Social Media",
};

const divisionColors: Record<string, string> = {
  content_creator: "from-purple-500 to-purple-600",
  production: "from-blue-500 to-blue-600",
  project_manager: "from-amber-500 to-amber-600",
  advertiser: "from-red-500 to-red-600",
  creative_director: "from-pink-500 to-pink-600",
  account_manager: "from-green-500 to-green-600",
  designer: "from-indigo-500 to-indigo-600",
  copywriter: "from-teal-500 to-teal-600",
  videographer: "from-orange-500 to-orange-600",
  social_media: "from-cyan-500 to-cyan-600",
};

export function DivisionAnalyticsWidget({ initialData }: DivisionAnalyticsWidgetProps) {
  const [stats, setStats] = useState<DivisionStat[]>(initialData || []);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData) return;
    loadData();
  }, [initialData]);

  async function loadData() {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (data.divisionStats) {
        setStats(data.divisionStats);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Analytics per Divisi</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Analytics per Divisi</h3>
        </div>
        <p className="py-4 text-center text-sm text-muted">Belum ada data divisi</p>
      </div>
    );
  }

  const maxTotal = Math.max(...stats.map((s) => s.total), 1);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users size={18} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Analytics per Divisi</h3>
      </div>

      <div className="space-y-3">
        {stats.map((div) => {
          const label = divisionLabels[div.name] || div.name;
          const gradient = divisionColors[div.name] || "from-gray-500 to-gray-600";
          const barWidth = (div.total / maxTotal) * 100;
          const progress = div.total > 0 ? (div.done / div.total) * 100 : 0;

          return (
            <div key={div.name} className="group">
              {/* Header */}
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                  <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] text-muted">
                    {div.members} member
                  </span>
                </div>
                {div.overdue > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-danger">
                    <AlertTriangle size={10} />
                    {div.overdue} overdue
                  </span>
                )}
              </div>

              {/* Bar */}
              <div className="relative h-6 w-full overflow-hidden rounded-md bg-surface">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-md bg-gradient-to-r opacity-80 transition-all", gradient)}
                  style={{ width: `${barWidth}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-[10px] font-semibold text-white">{div.total} tasks</span>
                  <span className="text-[10px] font-medium text-white/90">{progress.toFixed(0)}% done</span>
                </div>
              </div>

              {/* Stats breakdown */}
              <div className="mt-1 flex gap-2 text-[9px] text-muted">
                <span className="text-muted"><ClipboardList size={12} className="inline" /> {div.todo} todo</span>
                <span className="text-muted"><Zap size={12} className="inline" /> {div.in_progress} in progress</span>
                <span className="text-success"><CheckCircle2 size={12} className="inline" /> {div.done} done</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}