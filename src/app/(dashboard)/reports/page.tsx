"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Plus, FileText, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface Report {
  id: string;
  period_start: string;
  period_end: string;
  summary: string | null;
  performance_text: string | null;
  conclusion: string | null;
  action: string | null;
  status: string;
  client?: { name: string };
  pic?: { full_name: string };
}

export default function ReportsPage() {
  const supabase = createClient();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("weekly_reports")
        .select("*, client:clients(name), pic:profiles(full_name)")
        .order("created_at", { ascending: false });
      setReports((data as unknown as Report[]) || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const statusColors: Record<string, string> = {
    draft: "bg-surface text-muted",
    submitted: "bg-warning/20 text-warning",
    reviewed: "bg-success/20 text-success",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Reports</h1>
          <p className="text-sm text-muted">Laporan performa klien mingguan</p>
        </div>
        <button className="btn-primary">
          <Plus size={16} /> New Report
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada laporan mingguan</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((r) => (
            <div key={r.id} className="card card-hover cursor-pointer">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{r.client?.name || "Unknown Client"}</h3>
                  <p className="text-xs text-muted">
                    {formatDate(r.period_start, { day: "numeric", month: "short" })} — {formatDate(r.period_end, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className={`badge ${statusColors[r.status] || statusColors.draft}`}>{r.status}</span>
              </div>

              {r.summary && (
                <p className="mb-2 line-clamp-2 text-sm text-muted">{r.summary}</p>
              )}

              {r.performance_text && (
                <div className="mb-3 rounded-md border border-border bg-background p-2">
                  <p className="text-xs text-muted">Performance:</p>
                  <p className="text-sm text-white">{r.performance_text}</p>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted">PIC: {r.pic?.full_name || "-"}</span>
                <ChevronRight size={16} className="text-muted" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}