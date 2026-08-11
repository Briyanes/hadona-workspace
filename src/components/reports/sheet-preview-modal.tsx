"use client";

/**
 * 📋 SheetPreviewModal
 * ============================================================================
 * Modal untuk "Lihat Semua Sheet" — menampilkan semua sheet tabs dari published
 * Google Spreadsheet yang sudah di-publish oleh tim Advertiser Hadona.
 *
 * Cara pakai:
 *   <SheetPreviewModal
 *     open={show}
 *     onClose={() => setShow(false)}
 *     defaultUrl="https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv"
 *   />
 *
 * Data source: GET /api/reports/sheets (read-only, tidak tulis DB)
 * ============================================================================
 */

import { useEffect, useState, useCallback } from "react";
import {
  X,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Calendar,
  User,
  Hash,
} from "lucide-react";
import { formatDate, formatIDR, formatCompact, cn, extractError } from "@/lib/utils";
import { toast } from "sonner";

// ────────────────────────────────────────────────────────────────────────────
// TYPES (mirror dari API response)
// ────────────────────────────────────────────────────────────────────────────
interface PreviewMetric {
  key: string;
  rawLabel: string;
  value: number;
  unit: "currency" | "number" | "percent" | "ratio";
}

interface PreviewRow {
  rowIndex: number;
  date: string | null;
  clientName: string;
  picName: string;
  division: string;
  platform: "meta" | "google" | "tiktok" | "unknown";
  detectedObjective: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodRawText: string;
  metrics: PreviewMetric[];
  analysisText: string;
  status: string;
  parseWarnings: string[];
}

interface SheetInfo {
  gid: string;
  name: string;
  rowCount: number;
  parsedCount: number;
  errors: string[];
  headerRow: string[];
  previewRows: PreviewRow[];
}

interface SheetsResponse {
  url: string;
  fetchedAt: string;
  durationSec: number;
  totalSheets: number;
  totalRows: number;
  totalParsed: number;
  sheets: SheetInfo[];
  errors: string[];
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function formatMetricValue(value: number, unit: string): string {
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

const PLATFORM_BADGE: Record<string, string> = {
  meta: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  google: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  tiktok: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  unknown: "bg-surface text-muted dark:bg-gray-800 dark:text-muted/70",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-surface text-muted dark:bg-gray-800 dark:text-muted/70",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  reviewed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

// ────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  defaultUrl?: string;
}

export function SheetPreviewModal({ open, onClose, defaultUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SheetsResponse | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/reports/sheets?preview=10${defaultUrl ? `&url=${encodeURIComponent(defaultUrl)}` : ""}&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        cache: "no-store",
      });

      const contentType = res.headers.get("content-type") || "";
      const rawText = await res.text();
      if (!contentType.includes("application/json") || rawText.trim().startsWith("<")) {
        throw new Error("Response tidak valid. Vercel mungkin masih build. Coba lagi 1-2 menit.");
      }

      const json: SheetsResponse = JSON.parse(rawText);
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setData(json);
      setExpandedSheet(0);
      toast.success(
        `✅ ${json.totalSheets} sheet • ${json.totalRows} rows • ${json.durationSec}s`
      );
    } catch (err) {
      setError(extractError(err));
      toast.error("Gagal load sheet: " + extractError(err));
    } finally {
      setLoading(false);
    }
  }, [defaultUrl]);

  // Initial fetch saat modal dibuka
  useEffect(() => {
    if (open && !data && !loading) {
      fetchData();
    }
  }, [open, data, loading, fetchData]);

  // Escape key + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {/* ─── Header ─── */}
        <div className="flex items-start justify-between gap-4 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-foreground">📊 Semua Sheet di Google Spreadsheet</h2>
              <p className="mt-0.5 text-xs text-muted">
                Preview semua sheet tabs (mis. Januari&rsquo;26 – Juli&rsquo;26) yang sudah di-publish ke publik.
                Read-only — tidak mengubah DB.
              </p>
              {data?.url && (
                <a
                  href={data.url.replace("output=csv", "output=html")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Buka spreadsheet asli
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:bg-muted hover:text-foreground"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Loading state */}
          {loading && !data && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Mengambil semua sheet tabs…</p>
              <p className="text-xs text-muted/70">
                Fetch & parse multi-sheet (bisa 10-30 detik untuk 7 tabs)
              </p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-12 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">Gagal load sheet</p>
              <p className="max-w-md text-xs text-muted">{error}</p>
              <button
                type="button"
                onClick={fetchData}
                className="mt-2 rounded-lg bg-destructive px-4 py-2 text-xs font-medium text-white hover:bg-destructive/90"
              >
                Coba lagi
              </button>
            </div>
          )}

          {/* Data state */}
          {data && !loading && (
            <div className="space-y-4">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total Sheet" value={String(data.totalSheets)} />
                <StatCard label="Total Rows" value={String(data.totalRows)} />
                <StatCard label="Berhasil Parse" value={String(data.totalParsed)} />
                <StatCard label="Durasi" value={`${data.durationSec}s`} />
              </div>

              {/* Errors global */}
              {data.errors.length > 0 && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-warning">
                    <AlertCircle className="h-4 w-4" />
                    {data.errors.length} error saat fetch (kemungkinan sheet private)
                  </div>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted">
                    {data.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sheet list */}
              <div className="space-y-2">
                {data.sheets.map((sheet, idx) => {
                  const expanded = expandedSheet === idx;
                  const parseRate =
                    sheet.rowCount > 0
                      ? Math.round((sheet.parsedCount / sheet.rowCount) * 100)
                      : 0;
                  return (
                    <div
                      key={sheet.gid}
                      className="overflow-hidden rounded-xl border border-border bg-surface"
                    >
                      {/* Sheet header (clickable) */}
                      <button
                        type="button"
                        onClick={() => setExpandedSheet(expanded ? null : idx)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted" />
                          )}
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{sheet.name}</span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                gid={sheet.gid}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted">
                              {sheet.rowCount} rows • {sheet.parsedCount} ter-parse ({parseRate}%)
                              {sheet.errors.length > 0 && (
                                <span className="ml-2 text-warning">• {sheet.errors.length} parse error</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {parseRate >= 80 ? (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              ✓ Good
                            </span>
                          ) : parseRate >= 40 ? (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              ⚠ Partial
                            </span>
                          ) : (
                            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                              ✗ Low
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Sheet preview content */}
                      {expanded && (
                        <div className="border-t border-border bg-background/50 p-4">
                          {/* Header row */}
                          {sheet.headerRow.length > 0 && (
                            <div className="mb-3">
                              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                Header Kolom
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {sheet.headerRow.map((h, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                                  >
                                    {h || "(kosong)"}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Preview rows */}
                          {sheet.previewRows.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted">
                              Tidak ada row ter-parse di sheet ini (kemungkinan hanya header atau sheet kosong)
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                                Preview {sheet.previewRows.length} row pertama
                              </div>
                              {sheet.previewRows.map((row) => (
                                <RowPreviewCard key={row.rowIndex} row={row} />
                              ))}
                            </div>
                          )}

                          {/* Parse errors */}
                          {sheet.errors.length > 0 && (
                            <details className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-2 text-[11px]">
                              <summary className="cursor-pointer font-medium text-warning">
                                {sheet.errors.length} parse error di sheet ini
                              </summary>
                              <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-muted">
                                {sheet.errors.map((e, i) => (
                                  <li key={i}>• {e}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="border-t border-border bg-surface px-5 py-3 text-[11px] text-muted">
          💡 Tip: Setiap sheet tab (mis. &ldquo;Januari &lsquo;26&rdquo;) berisi weekly reports untuk bulan tersebut.
          Klik tab untuk expand & lihat preview rows.
          Untuk import semua, gunakan tombol <span className="font-semibold">Sync Now</span> di toolbar.
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB COMPONENTS
// ────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function RowPreviewCard({ row }: { row: PreviewRow }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-foreground">{row.clientName || "(no client)"}</span>
        {row.division && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground">
            {row.division}
          </span>
        )}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
            PLATFORM_BADGE[row.platform] || PLATFORM_BADGE.unknown
          )}
        >
          {row.platform}
        </span>
        {row.detectedObjective && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
            {row.detectedObjective}
          </span>
        )}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_BADGE[row.status] || STATUS_BADGE.draft
          )}
        >
          {row.status}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
        {row.date && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(row.date)}
          </span>
        )}
        {row.picName && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {row.picName}
          </span>
        )}
        {row.periodRawText && (
          <span className="inline-flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span className="truncate">{row.periodRawText}</span>
          </span>
        )}
      </div>

      {row.metrics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.metrics.slice(0, 6).map((m, i) => (
            <span
              key={i}
              className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
              title={`${m.rawLabel} = ${m.value} (${m.unit})`}
            >
              <span className="text-muted">{m.rawLabel}:</span>{" "}
              <span className="font-semibold">{formatMetricValue(m.value, m.unit)}</span>
            </span>
          ))}
          {row.metrics.length > 6 && (
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted">
              +{row.metrics.length - 6} lagi
            </span>
          )}
        </div>
      )}

      {row.analysisText && (
        <p className="mt-2 line-clamp-2 text-[11px] italic text-muted">
          &ldquo;{row.analysisText}&rdquo;
        </p>
      )}
    </div>
  );
}