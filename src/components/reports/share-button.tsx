"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
// BATCH 2 Sesi 2: types + METRIC_DEFS + formatMetric diimpor dari modul shared
// (single source of truth; sebelumnya duplikat 9-metrik versi lama di sini).
import { type Report, METRIC_DEFS, formatMetric } from "@/components/reports/metrics";

export function ShareButton({ report }: { report: Report }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  async function handleShare() {
    setCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ action: "create-share", reportId: report.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat share link");

      const url = `${window.location.origin}/shared/${data.token}`;
      setShareUrl(url);
      toast.success("Share link dibuat!");
    } catch (err) {
      toast.error("Gagal: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setCreating(false);
    }
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link disalin ke clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        onClick={handleShare}
        disabled={creating}
        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs text-accent hover:bg-background"
        title="Share ke client"
      >
        <Share2 size={12} /> {creating ? "Creating..." : "Share"}
      </button>

      {/* Share Link Modal */}
      <Modal open={!!shareUrl} onClose={() => setShareUrl(null)} title="🔗 Share Link Aktif">
            <p className="mb-3 text-xs text-muted">
              Kirim link ini ke client untuk lihat report tanpa login. Link akan aktif selamanya kecuali di-revoke.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl ?? ""}
                readOnly
                className="input flex-1 text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs hover:bg-background"
              >
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <a
                href={shareUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs text-white hover:opacity-90"
              >
                <ExternalLink size={14} /> Open
              </a>
            </div>
      </Modal>
    </>
  );
}

// ============================================
// PUBLIC VIEW COMPONENT (untuk /shared/[token])
// ============================================
export function SharedReportView({ report }: { report: Report }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-foreground">{report.client?.name}</h1>
          <span className="badge bg-primary/10 text-primary">Weekly Report</span>
        </div>
        <p className="text-sm text-muted">
          {formatDate(report.period_start, { day: "numeric", month: "long" })} —{" "}
          {formatDate(report.period_end, { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Metrics */}
      {report.report_metrics && report.report_metrics.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted">📊 Metrik Performa</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METRIC_DEFS.map((m) => {
              const metricVals = report.report_metrics!.filter((x) => x.metric_type === m.key);
              if (metricVals.length === 0) return null;
              const val = metricVals.reduce((s, x) => s + (x.value || 0), 0);
              const prev = metricVals[0]?.previous_value;
              const delta =
                prev !== null && prev !== undefined && prev !== 0
                  ? ((val - prev) / prev) * 100
                  : null;

              return (
                <div key={m.key} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-muted">{m.label}</p>
                  <p className="text-lg font-bold text-foreground">{formatMetric(val, m.unit)}</p>
                  {delta !== null && (
                    <p
                      className={`flex items-center gap-0.5 text-xs ${
                        delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
                      }`}
                    >
                      {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(1)}% vs minggu lalu
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Text sections */}
      {report.summary && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted">📝 Ringkasan</h2>
          <p className="text-sm text-muted">{report.summary}</p>
        </div>
      )}
      {report.performance_text && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted">⚡ Performance Notes</h2>
          <p className="text-sm text-muted">{report.performance_text}</p>
        </div>
      )}
      {report.conclusion && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted">🎯 Kesimpulan</h2>
          <p className="text-sm text-muted">{report.conclusion}</p>
        </div>
      )}
      {report.action && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase text-muted">📋 Action Plan</h2>
          <p className="text-sm text-muted">{report.action}</p>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border pt-4 text-center text-xs text-muted">
        <p>Powered by Hadona Workspace</p>
      </div>
    </div>
  );
}