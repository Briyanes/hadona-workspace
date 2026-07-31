"use client";

import { useEffect, useState } from "react";
import { SharedReportView } from "@/components/reports/share-button";
import { FileText, Loader2, AlertCircle } from "lucide-react";

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
  summary: string | null;
  performance_text: string | null;
  conclusion: string | null;
  action: string | null;
  status: string;
  client?: { name: string };
  report_metrics?: ReportMetric[];
}

export function ReportView({ token }: { token: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function loadReport() {
      try {
        const res = await fetch(`/api/reports/public?token=${token}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Gagal memuat report");
        }
        setReport(data.report);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm text-muted">Memuat weekly report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-4">
        <AlertCircle className="text-danger" size={32} />
        <h1 className="text-lg font-bold text-gray-900">Report Tidak Tersedia</h1>
        <p className="text-center text-sm text-muted">{error}</p>
        <p className="text-xs text-muted">Hubungi account manager Anda untuk link baru.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50">
        <FileText className="text-muted" size={32} />
        <p className="text-sm text-muted">Report tidak ditemukan</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SharedReportView report={report} />
    </div>
  );
}