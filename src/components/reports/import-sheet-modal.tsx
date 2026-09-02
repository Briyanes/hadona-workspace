/**
 * 📊 Import Sheet Modal — Weekly Report
 * ============================================================================
 * Modal untuk import weekly report dari Google Spreadsheet yang sudah di-publish.
 *
 * Flow:
 *   1. User paste URL Google Sheet (publish-to-web CSV)
 *   2. Klik "Preview" → API parse sheet & matching fuzzy ke client DB
 *   3. Tampilkan tabel preview dengan status match (matched / no-match / exists)
 *   4. User pilih rows yang mau diimport + override match kalau perlu
 *   5. Klik "Import" → API insert ke weekly_reports & report_metrics
 *
 * UI/UX decisions by 2 UI/UX Expert:
 *   - Step-based flow (URL → Preview → Result) supaya jelas progress-nya
 *   - Color-coded badges (green/success, yellow/warning, red/error)
 *   - Toggle "Select All Matched Only" untuk filter cerdas
 *   - Inline client selector dropdown kalau match salah
 *   - Auto-collapse metrics untuk hemat vertical space
 * ============================================================================
 */

"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, FileSpreadsheet, Lightbulb, Link2, Loader2, Sparkles, X, XCircle } from 'lucide-react';
import { useState } from "react";
import { toast } from "sonner";

import { cn, formatDate, formatIDR, formatCompact } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

// ============================================================================
// TYPES (sync dengan API route)
// ============================================================================

interface PreviewMetric {
  key: string;
  rawLabel: string;
  value: number;
  unit: string;
}

interface PreviewRow {
  rowIndex: number;
  date: string | null;
  clientName: string;
  picName: string;
  division: string;
  platform: string;
  detectedObjective: string;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: PreviewMetric[];
  analysisText: string;
  status: string;
  rawPerformanceText: string;
  matchedClient: { id: string; name: string; confidence: number } | null;
  matchedPic: { id: string; full_name: string; confidence: number } | null;
  matchStatus: "matched" | "no-match" | "exists" | "no-metric";
  existingReportId?: string;
  parseWarnings: string[];
}

interface PreviewStats {
  total: number;
  matched: number;
  noMatch: number;
  exists: number;
  noMetric: number;
}

interface ImportResult {
  success: boolean;
  summary: {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
    // 🆕 v2.3 (Sprint 4.6 P1): derived breakdown for transparency
    // Computed client-side dari results array (tidak perlu ubah backend).
    // Bucket sesuai skipReason di result.error / result.skipReason.
    skippedBreakdown?: {
      dedup: number;
      unmatchedClient: number;
      noPeriod: number;
      noMetric: number;
      noClient: number;
      other: number;
      samples: {
        dedup: string[];
        unmatchedClient: string[];
        noPeriod: string[];
        noMetric: string[];
        noClient: string[];
        other: string[];
      };
    };
  };
  results: Array<{
    rowIndex: number;
    status: "imported" | "skipped" | "error";
    reportId?: string;
    clientId?: string;
    error?: string;
    // 🆕 v2.3: optional clientName & skipReason dari backend untuk breakdown
    clientName?: string;
    skipReason?: string;
  }>;
}

interface Client {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  defaultSheetUrl?: string;
  onImported?: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImportSheetModal({
  open,
  onClose,
  clients,
  defaultSheetUrl = "",
  onImported,
}: Props) {
  const [step, setStep] = useState<"url" | "preview" | "result">("url");
  const [sheetUrl, setSheetUrl] = useState(defaultSheetUrl);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  const [collapsedRows, setCollapsedRows] = useState<Set<number>>(new Set());
  // Override client per row (rowIndex → clientId)
  const [clientOverrides, setClientOverrides] = useState<Record<number, string>>({});

  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [options, setOptions] = useState({
    autoCreateClient: false,
    skipExisting: true,
  });

  if (!open) return null;

  // ─── Handlers ───

  function handleClose() {
    // Reset state saat close
    setStep("url");
    setSheetUrl(defaultSheetUrl);
    setPreviewRows([]);
    setPreviewStats(null);
    setParseErrors([]);
    setSelectedRowIndexes(new Set());
    setCollapsedRows(new Set());
    setClientOverrides({});
    setImportResult(null);
    onClose();
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim()) {
      toast.error("URL sheet wajib diisi");
      return;
    }
    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      toast.error("URL harus dari Google Spreadsheet");
      return;
    }

    setLoading(true);
    setParseErrors([]);
    try {
      const res = await fetch("/api/reports/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", sheetUrl: sheetUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal preview sheet");

      setPreviewRows(data.rows || []);
      setPreviewStats(data.stats || null);
      setParseErrors(data.parseErrors || []);

      // Auto-select rows yang matched (bukan exists/no-match)
      const autoSelected = new Set<number>(
        (data.rows as PreviewRow[])
          .filter((r) => r.matchStatus === "matched")
          .map((r) => r.rowIndex)
      );
      setSelectedRowIndexes(autoSelected);

      // Auto-collapse all rows for cleaner overview
      setCollapsedRows(new Set((data.rows as PreviewRow[]).map((r) => r.rowIndex)));

      setStep("preview");

      const stats = data.stats as PreviewStats;
      toast.success(
        `✅ ${stats.total} baris terbaca • ${stats.matched} matched • ${stats.exists} sudah ada • ${stats.noMatch} no-match`,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error("Gagal preview: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  // 🆕 Sprint 4.9 P2: handleImport accept optional rowIndexes untuk re-import subset
  // (dipanggil dari ResultStep saat user resolve unmatched client).
  // Jika tidak ada parameter, gunakan selectedRowIndexes (behavior lama).
  async function handleImport(rowIndexes?: number[]) {
    const targetIndexes = rowIndexes ?? Array.from(selectedRowIndexes);
    if (targetIndexes.length === 0) {
      toast.error("Pilih minimal 1 baris untuk diimport");
      return;
    }

    const targetSet = new Set(targetIndexes);
    const rowsToImport = previewRows
      .filter((r) => targetSet.has(r.rowIndex))
      .map((r) => ({
        rowIndex: r.rowIndex,
        clientName: r.clientName,
        picName: r.picName,
        division: r.division,
        platform: r.platform,
        detectedObjective: r.detectedObjective,
        date: r.date,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        metrics: r.metrics,
        analysisText: r.analysisText,
        status: r.status,
        rawPerformanceText: r.rawPerformanceText,
        matchedClientId: clientOverrides[r.rowIndex] || r.matchedClient?.id,
        matchedPicId: r.matchedPic?.id,
      }));

    setImporting(true);
    try {
      const res = await fetch("/api/reports/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          rows: rowsToImport,
          options,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal import");

      setImportResult(data);
      setStep("result");

      const summary = data.summary;
      if (summary.imported > 0) {
        toast.success(
          `✅ ${summary.imported} report berhasil diimport! ${summary.skipped > 0 ? `(${summary.skipped} di-skip)` : ""}`,
          { duration: 6000 }
        );
        onImported?.();
      } else {
        toast.info(`Tidak ada report baru yang diimport (${summary.skipped} di-skip, ${summary.errors} error)`);
      }
    } catch (err) {
      toast.error("Gagal import: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImporting(false);
    }
  }

  function toggleRowSelection(rowIndex: number) {
    const next = new Set(selectedRowIndexes);
    if (next.has(rowIndex)) next.delete(rowIndex);
    else next.add(rowIndex);
    setSelectedRowIndexes(next);
  }

  function toggleRowCollapsed(rowIndex: number) {
    const next = new Set(collapsedRows);
    if (next.has(rowIndex)) next.delete(rowIndex);
    else next.add(rowIndex);
    setCollapsedRows(next);
  }

  function selectAllMatched() {
    const next = new Set<number>();
    previewRows.forEach((r) => {
      if (r.matchStatus === "matched") next.add(r.rowIndex);
    });
    setSelectedRowIndexes(next);
  }

  function selectAll() {
    setSelectedRowIndexes(new Set(previewRows.map((r) => r.rowIndex)));
  }

  function deselectAll() {
    setSelectedRowIndexes(new Set());
  }

  // ─── Render ───

  // Footer kondisional per step — dirender sebagai sticky footer oleh shared <Modal>
  const footerNode =
    step === "preview" ? (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted">
          <strong className="text-foreground">{selectedRowIndexes.size}</strong> baris dipilih
          {previewStats && (
            <> • Match rate: {Math.round((previewStats.matched / Math.max(previewStats.total, 1)) * 100)}%</>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setStep("url")} className="btn-secondary">
            Kembali
          </button>
          <button
            onClick={() => handleImport()}
            disabled={importing || selectedRowIndexes.size === 0}
            className="btn-primary"
          >
            {importing ? (
              <>
                <Loader2 className="animate-spin" size={14} /> Importing...
              </>
            ) : (
              <>
                <Download size={14} /> Import {selectedRowIndexes.size} Report
              </>
            )}
          </button>
        </div>
      </div>
    ) : step === "result" ? (
      <button onClick={handleClose} className="btn-primary">
        Selesai
      </button>
    ) : null;

  return (
    <Modal
      open
      onClose={handleClose}
      size="xl"
      scrollable
      footer={footerNode}
      header={
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileSpreadsheet className="text-primary" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Import Weekly Report dari Google Sheet
              </h2>
              <p className="text-xs text-muted">
                Auto-parse semua client dari sheet publish-to-web
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
      {/* ─── Stepper ─── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/50 px-4 py-2 text-xs">
        <StepBadge label="1. URL Sheet" active={step === "url"} done={step !== "url"} />
        <div className="h-px w-6 bg-border" />
        <StepBadge label="2. Preview" active={step === "preview"} done={step === "result"} />
        <div className="h-px w-6 bg-border" />
        <StepBadge label="3. Result" active={step === "result"} done={false} />
      </div>
      <div>
          {step === "url" && (
            <form onSubmit={handlePreview} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Google Sheet URL (Publish to Web)
                </label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/e/2PACX-xxxx/pub?output=csv"
                    className="input pl-9"
                    autoFocus
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Di Google Sheet: <strong>File → Share → Publish to web → Entire document → CSV</strong>
                </p>
              </div>

              {/* Helper card */}
              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted">
                <p className="mb-1.5 font-semibold text-foreground">📋 Format sheet yang didukung:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Kolom: <code className="rounded bg-surface px-1">No | Input Date | Client | PIC | Divisi | Performance | Analisa | Status</code></li>
                  <li>Kolom "Performance" multi-line: <code className="rounded bg-surface px-1">Spend: Rp1.234.567</code>, <code className="rounded bg-surface px-1">CTR: 1.35%</code>, dll</li>
                  <li>Format angka: <code>Rp1.234.567</code>, <code>1,234,567</code>, <code>1.51%</code>, <code>3.5x</code> semua auto-detect</li>
                  <li>Platform auto-detect dari prefix (Meta ADS / Google ADS / TikTok)</li>
                  <li>Period auto-extract dari text "19 s/d 25/1/26"</li>
                </ul>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.skipExisting}
                    onChange={(e) => setOptions({ ...options, skipExisting: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Skip duplicate report</div>
                    <div className="text-xs text-muted">Skip jika client + period_start sudah ada</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={options.autoCreateClient}
                    onChange={(e) => setOptions({ ...options, autoCreateClient: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Auto-create client baru</div>
                    <div className="text-xs text-muted">
                      Buat client baru otomatis kalau tidak ketemu match (dipakai untuk client pertama kali)
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Batal
                </button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={14} /> Memproses...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Preview & Match
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === "preview" && (
            <PreviewStep
              rows={previewRows}
              stats={previewStats}
              parseErrors={parseErrors}
              selectedRowIndexes={selectedRowIndexes}
              collapsedRows={collapsedRows}
              clientOverrides={clientOverrides}
              clients={clients}
              onToggleRow={toggleRowSelection}
              onToggleCollapse={toggleRowCollapsed}
              onSelectAllMatched={selectAllMatched}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onClientOverride={(rowIndex, clientId) =>
                setClientOverrides((prev) => ({ ...prev, [rowIndex]: clientId }))
              }
            />
          )}

          {step === "result" && importResult && (
            <ResultStep
              result={importResult}
              previewRows={previewRows}
              clients={clients}
              clientOverrides={clientOverrides}
              reimporting={importing}
              onOverrideChange={(rowIndex, clientId) =>
                setClientOverrides((prev) => ({ ...prev, [rowIndex]: clientId }))
              }
              onReimport={(rowIndexes) => handleImport(rowIndexes)}
            />
          )}
      </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// STEP BADGE
// ============================================================================

function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 font-medium",
        active && "bg-primary/10 text-primary",
        done && "text-success",
        !active && !done && "text-muted"
      )}
    >
      {done && <CheckCircle2 size={12} />}
      {label}
    </div>
  );
}

// ============================================================================
// PREVIEW STEP
// ============================================================================

interface PreviewStepProps {
  rows: PreviewRow[];
  stats: PreviewStats | null;
  parseErrors: string[];
  selectedRowIndexes: Set<number>;
  collapsedRows: Set<number>;
  clientOverrides: Record<number, string>;
  clients: Client[];
  onToggleRow: (rowIndex: number) => void;
  onToggleCollapse: (rowIndex: number) => void;
  onSelectAllMatched: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onClientOverride: (rowIndex: number, clientId: string) => void;
}

function PreviewStep({
  rows,
  stats,
  parseErrors,
  selectedRowIndexes,
  collapsedRows,
  clientOverrides,
  clients,
  onToggleRow,
  onToggleCollapse,
  onSelectAllMatched,
  onSelectAll,
  onDeselectAll,
  onClientOverride,
}: PreviewStepProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="mb-3 text-warning" size={32} />
        <p className="text-sm text-muted">
          Sheet berhasil dibaca tapi tidak ada baris data. Pastikan sheet punya baris selain header.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatPill label="Total" value={stats.total} color="bg-primary/10 text-primary" />
          <StatPill label="Matched" value={stats.matched} color="bg-success/10 text-success" />
          <StatPill label="Sudah Ada" value={stats.exists} color="bg-warning/10 text-warning" />
          <StatPill label="No Match" value={stats.noMatch + stats.noMetric} color="bg-error/10 text-error" />
        </div>
      )}

      {/* Bulk action */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button onClick={onSelectAllMatched} className="btn-secondary py-1 text-xs">
          ✓ Pilih Matched Only
        </button>
        <button onClick={onSelectAll} className="btn-secondary py-1 text-xs">
          Pilih Semua
        </button>
        <button onClick={onDeselectAll} className="btn-secondary py-1 text-xs">
          Bersihkan
        </button>
        {parseErrors.length > 0 && (
          <span className="ml-auto text-warning">
            ⚠️ {parseErrors.length} parse warning (lihat console)
          </span>
        )}
      </div>

      {/* Rows list */}
      <div className="space-y-2">
        {rows.map((row) => (
          <PreviewRowCard
            key={row.rowIndex}
            row={row}
            selected={selectedRowIndexes.has(row.rowIndex)}
            collapsed={collapsedRows.has(row.rowIndex)}
            clientOverride={clientOverrides[row.rowIndex]}
            clients={clients}
            onToggleRow={() => onToggleRow(row.rowIndex)}
            onToggleCollapse={() => onToggleCollapse(row.rowIndex)}
            onClientOverride={(clientId) => onClientOverride(row.rowIndex, clientId)}
          />
        ))}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={cn("rounded-md px-3 py-2 text-center", color)}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

// ============================================================================
// PREVIEW ROW CARD
// ============================================================================

interface PreviewRowCardProps {
  row: PreviewRow;
  selected: boolean;
  collapsed: boolean;
  clientOverride?: string;
  clients: Client[];
  onToggleRow: () => void;
  onToggleCollapse: () => void;
  onClientOverride: (clientId: string) => void;
}

function PreviewRowCard({
  row,
  selected,
  collapsed,
  clientOverride,
  clients,
  onToggleRow,
  onToggleCollapse,
  onClientOverride,
}: PreviewRowCardProps) {
  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    matched: {
      label: "Siap Import",
      color: "bg-success/20 text-success",
      icon: <CheckCircle2 size={11} />,
    },
    exists: {
      label: "Sudah Ada",
      color: "bg-warning/20 text-warning",
      icon: <AlertTriangle size={11} />,
    },
    "no-match": {
      label: "Client No Match",
      color: "bg-error/20 text-error",
      icon: <XCircle size={11} />,
    },
    "no-metric": {
      label: "No Metric",
      color: "bg-border text-muted",
      icon: <AlertTriangle size={11} />,
    },
  };

  const status = statusConfig[row.matchStatus] || statusConfig["no-match"];
  const effectiveClientId = clientOverride || row.matchedClient?.id;
  const spend = row.metrics.find((m) => m.key === "amount_spent" || m.key === "spend")?.value;
  const ctr = row.metrics.find((m) => m.key === "ctr_all" || m.key === "ctr")?.value;
  const purchases = row.metrics.find((m) => m.key === "purchases" || m.key === "results")?.value;

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border bg-surface"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleRow}
          className="shrink-0"
        />
        <button
          onClick={onToggleCollapse}
          className="shrink-0 text-muted hover:text-foreground"
          aria-label="Toggle detail"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {row.clientName || <em className="text-muted">(no name)</em>}
            </span>
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                status.color
              )}
            >
              {status.icon}
              {status.label}
            </span>
            {row.platform && row.platform !== "unknown" && (
              <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] uppercase text-muted">
                {row.platform}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {row.periodStart && (
              <span>
                📅 {formatDate(row.periodStart)} → {row.periodEnd ? formatDate(row.periodEnd) : "?"}
              </span>
            )}
            {row.picName && <span>👤 {row.picName}</span>}
            {row.division && <span>🏢 {row.division}</span>}
            {row.metrics.length > 0 && <span>📊 {row.metrics.length} metrics</span>}
          </div>
        </div>

        {/* Quick stats */}
        <div className="hidden shrink-0 items-center gap-3 text-xs sm:flex">
          {spend !== undefined && (
            <div className="text-right">
              <div className="text-muted">Spend</div>
              <div className="font-semibold text-foreground">{formatIDR(spend)}</div>
            </div>
          )}
          {purchases !== undefined && (
            <div className="text-right">
              <div className="text-muted">Result</div>
              <div className="font-semibold text-foreground">{formatCompact(purchases)}</div>
            </div>
          )}
          {ctr !== undefined && (
            <div className="text-right">
              <div className="text-muted">CTR</div>
              <div className="font-semibold text-foreground">{ctr.toFixed(2)}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Detail (expanded) */}
      {!collapsed && (
        <div className="border-t border-border bg-background/30 p-3">
          {/* Match status detail */}
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Matched Client {row.matchedClient && (
                  <span className="text-success">
                    ✓ {(row.matchedClient.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </label>
              <select
                value={effectiveClientId || ""}
                onChange={(e) => onClientOverride(e.target.value)}
                className="input py-1 text-xs"
              >
                <option value="">— Pilih client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                PIC {row.matchedPic && (
                  <span className="text-success">
                    ✓ {row.matchedPic.full_name} ({(row.matchedPic.confidence * 100).toFixed(0)}%)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={row.picName}
                readOnly
                className="input bg-surface py-1 text-xs"
              />
            </div>
          </div>

          {/* Metrics grid */}
          {row.metrics.length > 0 ? (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Metrics terparse:</p>
              <div className="flex flex-wrap gap-1.5">
                {row.metrics.map((m, i) => (
                  <span
                    key={`${m.key}-${i}`}
                    className="inline-flex items-center gap-1 rounded bg-surface px-2 py-1 text-[11px] border border-border"
                    title={m.rawLabel}
                  >
                    <span className="text-muted">{m.rawLabel}:</span>
                    <span className="font-semibold text-foreground">{formatMetric(m.value, m.unit)}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded bg-warning/10 p-2 text-xs text-warning">
              ⚠️ Tidak ada metric terparse dari cell performance. Pastikan formatnya "Label: Value".
            </div>
          )}

          {/* Analysis text */}
          {row.analysisText && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Analisa:</p>
              <p className="rounded bg-surface p-2 text-xs text-muted whitespace-pre-wrap">
                {row.analysisText}
              </p>
            </div>
          )}

          {/* Raw performance (collapsible) */}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted hover:text-foreground">
              Lihat raw performance text
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-surface p-2 text-[10px] text-muted whitespace-pre-wrap">
              {row.rawPerformanceText}
            </pre>
          </details>

          {/* Warnings */}
          {row.parseWarnings.length > 0 && (
            <div className="mt-2 text-[10px] text-warning">
              ⚠️ {row.parseWarnings.length} warning: {row.parseWarnings.slice(0, 2).join(", ")}
              {row.parseWarnings.length > 2 && "..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatMetric(value: number, unit: string): string {
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

// ============================================================================
// RESULT STEP — dengan Skip Breakdown (Sprint 4.6 P1)
// ============================================================================

/**
 * Klasifikasikan skip reason ke salah satu bucket.
 * Pattern matching pada error/skipReason message dari backend.
 *
 * Backend (`/api/reports/import-sheet/route.ts` line 385) memberi reason seperti:
 *   - "Duplicate (client + period sudah ada)" → dedup
 *   - "Client tidak dikenali: Rmoda"          → unmatchedClient
 *   - "Period tidak valid"                     → noPeriod
 *   - "Tidak ada metric"                       → noMetric
 *   - "Client kosong"                          → noClient
 */
type SkipBucket = "dedup" | "unmatchedClient" | "noPeriod" | "noMetric" | "noClient" | "other";

function classifySkipReason(reason: string | undefined): SkipBucket {
  const r = (reason || "").toLowerCase();
  if (!r) return "other";
  if (r.includes("duplikat") || r.includes("duplicate") || r.includes("sudah ada") || r.includes("dedup")) return "dedup";
  if (r.includes("tidak dikenali") || r.includes("unmatched") || r.includes("no match") || r.includes("client tidak")) return "unmatchedClient";
  if (r.includes("period") || r.includes("tanggal") || r.includes("periode")) return "noPeriod";
  if (r.includes("metric") || r.includes("metrik")) return "noMetric";
  if (r.includes("client kosong") || r.includes("no client") || r.includes("nama client")) return "noClient";
  return "other";
}

/**
 * Derive breakdown dari results array (client-side).
 * Backend tidak perlu ubah — kita compute di frontend.
 */
function deriveSkipBreakdown(results: ImportResult["results"]) {
  const breakdown = {
    dedup: 0,
    unmatchedClient: 0,
    noPeriod: 0,
    noMetric: 0,
    noClient: 0,
    other: 0,
    samples: {
      dedup: [] as string[],
      unmatchedClient: [] as string[],
      noPeriod: [] as string[],
      noMetric: [] as string[],
      noClient: [] as string[],
      other: [] as string[],
    },
  };

  for (const r of results) {
    if (r.status !== "skipped") continue;
    const reason = r.skipReason || r.error;
    const bucket = classifySkipReason(reason);
    breakdown[bucket] += 1;
    if (breakdown.samples[bucket].length < 3) {
      const label = r.clientName ? `#${r.rowIndex} "${r.clientName}"` : `#${r.rowIndex}`;
      const detail = reason ? ` — ${reason.slice(0, 60)}` : "";
      breakdown.samples[bucket].push(`${label}${detail}`);
    }
  }

  return breakdown;
}

// ============================================================================
// HELPER: Smart client suggestions (Sprint 4.9 P2)
// ============================================================================

/**
 * Cari client yang mirip dengan nama dari sheet berdasarkan:
 * 1. Substring match (prioritas tinggi)
 * 2. Token overlap (kata-kata yang sama)
 * 3. Levenshtein distance (typo tolerance)
 *
 * Return top-3 suggestion diurutkan by score desc.
 */
function findClientSuggestions(
  unmatchedName: string,
  clients: Client[],
  limit = 3
): Array<{ client: Client; score: number; reason: string }> {
  const target = normalizeName(unmatchedName);
  if (!target || target.length < 2) return [];

  const targetTokens = new Set(target.split(/\s+/).filter((t) => t.length >= 3));
  const scored: Array<{ client: Client; score: number; reason: string }> = [];

  for (const client of clients) {
    const candidate = normalizeName(client.name);
    if (!candidate) continue;

    let score = 0;
    let reason = "";

    // 1. Exact match (boleh beda case/whitespace)
    if (target === candidate) {
      score = 100;
      reason = "exact";
    }
    // 2. Substring match (target adalah bagian candidate atau sebaliknya)
    else if (target.length >= 4 && candidate.includes(target)) {
      score = 90;
      reason = "substring";
    } else if (candidate.length >= 4 && target.includes(candidate)) {
      score = 85;
      reason = "substring-rev";
    }
    // 3. Token overlap (kata-kata yang sama, minimal 1 token ≥3 char)
    else {
      const candidateTokens = new Set(candidate.split(/\s+/).filter((t) => t.length >= 3));
      let overlap = 0;
      // Iterate via Array.from untuk kompatibilitas target TS (no downlevelIteration)
      for (const t of Array.from(targetTokens)) {
        if (candidateTokens.has(t)) overlap++;
      }
      if (overlap > 0) {
        score = 50 + overlap * 10;
        reason = `overlap:${overlap}`;
      }
    }

    // 4. Levenshtein fallback untuk typo tolerance (1-2 char diff)
    if (score === 0) {
      const dist = levenshtein(target, candidate);
      const maxLen = Math.max(target.length, candidate.length);
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;
      if (similarity >= 0.75 && dist <= 3) {
        score = Math.round(similarity * 60);
        reason = `typo:${dist}`;
      }
    }

    if (score > 0) {
      scored.push({ client, score, reason });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein distance — iterative DP, O(m*n).
 * Untuk performa, dibatasi max length 30 (nama client jarang >30 char).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length > 30 || b.length > 30) return 99;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

// ============================================================================
// RESULT STEP — dengan Skip Breakdown (Sprint 4.6 P1)
// + Auto-suggest client resolver (Sprint 4.9 P2)
// ============================================================================

interface ResultStepProps {
  result: ImportResult;
  // 🆕 Sprint 4.9 P2: props untuk resolver
  previewRows: PreviewRow[];
  clients: Client[];
  clientOverrides: Record<number, string>;
  reimporting: boolean;
  onOverrideChange: (rowIndex: number, clientId: string) => void;
  onReimport: (rowIndexes: number[]) => void;
}

function ResultStep({
  result,
  previewRows,
  clients,
  clientOverrides,
  reimporting,
  onOverrideChange,
  onReimport,
}: ResultStepProps) {
  const { summary, results } = result;
  const success = summary.imported > 0;
  const [showSkipDetail, setShowSkipDetail] = useState(false);

  // 🆕 Sprint 4.6 P1: derive breakdown dari results array
  const breakdown = summary.skippedBreakdown || (summary.skipped > 0 ? deriveSkipBreakdown(results) : null);
  const hasActionableSkip = !!breakdown && (breakdown.unmatchedClient > 0 || breakdown.noPeriod > 0);

  // 🆕 Sprint 4.9 P2: derive unmatched rows yang masih bisa di-resolve
  // Ambil row yang skipped dengan reason "unmatchedClient" DAN masih ada di previewRows
  // DAN belum punya override (karena kalau sudah di-override & re-import, tidak perlu tampil lagi).
  const unmatchedRows = results.filter((r) => {
    if (r.status !== "skipped") return false;
    const reason = r.skipReason || r.error || "";
    const isUnmatched =
      /tidak dikenali|unmatched|no match|client tidak/i.test(reason);
    if (!isUnmatched) return false;
    // Cek apakah row ini masih ada di previewRows (belum di-resolve)
    const previewRow = previewRows.find((p) => p.rowIndex === r.rowIndex);
    if (!previewRow) return false;
    // Skip kalau sudah ada override (sudah ditangani)
    const hasOverride = !!clientOverrides[r.rowIndex];
    return !hasOverride;
  });

  return (
    <div className="space-y-4">
      {/* Result summary */}
      <div
        className={cn(
          "rounded-lg border p-4",
          success
            ? "border-success/30 bg-success/5"
            : summary.errors > 0
            ? "border-error/30 bg-error/5"
            : "border-warning/30 bg-warning/5"
        )}
      >
        <div className="flex items-center gap-3">
          {success ? (
            <CheckCircle2 className="text-success" size={28} />
          ) : (
            <AlertTriangle className="text-warning" size={28} />
          )}
          <div>
            <p className="text-base font-bold text-foreground">
              {success ? "Import Berhasil!" : "Import Selesai"}
            </p>
            <p className="text-xs text-muted">
              {summary.imported} report baru • {summary.skipped} di-skip • {summary.errors} error
              {" "}
              (dari total {summary.total} baris)
            </p>
          </div>
        </div>
      </div>

      {/* 🆕 Sprint 4.9 P2: Unmatched Client Resolver Card */}
      {unmatchedRows.length > 0 && (
        <UnmatchedResolverCard
          unmatchedRows={unmatchedRows}
          previewRows={previewRows}
          clients={clients}
          clientOverrides={clientOverrides}
          reimporting={reimporting}
          onOverrideChange={onOverrideChange}
          onReimport={onReimport}
        />
      )}

      {/* 🆕 Sprint 4.6 P1: Skip Breakdown Card (collapsible) */}
      {breakdown && summary.skipped > 0 && (
        <div
          className={cn(
            "rounded-md border p-3",
            hasActionableSkip
              ? "border-warning/30 bg-warning/5"
              : "border-info/30 bg-info/5"
          )}
        >
          <button
            type="button"
            onClick={() => setShowSkipDetail((v) => !v)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={showSkipDetail}
          >
            <div className="flex items-center gap-2">
              {hasActionableSkip ? (
                <AlertTriangle className="text-warning" size={14} />
              ) : (
                <CheckCircle2 className="text-info" size={14} />
              )}
              <p className={cn("text-xs font-semibold", hasActionableSkip ? "text-warning" : "text-info")}>
                Mengapa {summary.skipped} row di-skip?
              </p>
            </div>
            <span className="text-xs text-muted">
              {showSkipDetail ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>

          {!showSkipDetail && (
            <p className="mt-1.5 text-[10px] text-muted">
              {hasActionableSkip
                ? "⚠️ Ada baris yang mungkin perlu review (client tidak dikenali / format tanggal)."
                : "✅ Semua skip aman — baris naratif atau duplikat yang sudah ada di DB."}
              {" "}
              <span className="font-medium text-info">Klik untuk detail →</span>
            </p>
          )}

          {showSkipDetail && (
            <div className="mt-3 space-y-3">
              <p className="text-[10px] text-muted">
                Breakdown alasan skip — bukan error, melainkan baris yang sengaja tidak diproses.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <BreakdownTile
                  label="Dedup"
                  value={breakdown.dedup}
                  description="Duplikat (sudah ada di DB)"
                  tone="neutral"
                />
                <BreakdownTile
                  label="Unmatched"
                  value={breakdown.unmatchedClient}
                  description="Client tidak dikenali di DB"
                  tone="warning"
                />
                <BreakdownTile
                  label="No Period"
                  value={breakdown.noPeriod}
                  description="Format tanggal tidak terdeteksi"
                  tone="warning"
                />
                <BreakdownTile
                  label="No Metric"
                  value={breakdown.noMetric}
                  description="Baris naratif (KESIMPULAN, ACTION)"
                  tone="neutral"
                />
                <BreakdownTile
                  label="No Client"
                  value={breakdown.noClient}
                  description="Baris kosong / separator"
                  tone="neutral"
                />
                {breakdown.other > 0 && (
                  <BreakdownTile
                    label="Lainnya"
                    value={breakdown.other}
                    description="Alasan skip lain"
                    tone="neutral"
                  />
                )}
              </div>

              {/* Samples — tampilkan contoh per kategori untuk debugging */}
              <div className="space-y-2">
                {([
                  ["unmatchedClient", "⚠️ Client tidak dikenali"],
                  ["dedup", "🔁 Row dedup (sudah ada)"],
                  ["noPeriod", "📅 Format tanggal tidak terdeteksi"],
                  ["noMetric", "📝 Baris naratif"],
                  ["noClient", "️ Client kosong"],
                  ["other", "❓ Lainnya"],
                ] as const).map(([key, label]) => {
                  const items = breakdown.samples[key] || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={key} className="rounded bg-background p-2">
                      <p className="mb-1 text-[9px] font-semibold uppercase text-muted">{label}</p>
                      <ul className="space-y-0.5 text-[9px] text-muted">
                        {items.map((ex, i) => (
                          <li key={i} className="font-mono">{ex}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Action hint */}
              {hasActionableSkip && (
                <div className="rounded bg-warning/10 p-2 text-[10px] text-warning">
                  💡 <strong>Tip:</strong> Untuk unmatched client, cek spelling nama client di master DB.
                  Untuk no-period, pastikan format tanggal di cell performance:{" "}
                  <code className="rounded bg-surface px-1">19 s/d 25/1/26</code>.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Per-row results */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Detail per baris:</p>
        {results.map((r) => {
          const config = {
            imported: { color: "text-success", icon: <CheckCircle2 size={12} />, label: "Imported" },
            skipped: { color: "text-warning", icon: <AlertTriangle size={12} />, label: "Skipped" },
            error: { color: "text-error", icon: <XCircle size={12} />, label: "Error" },
          }[r.status];

          return (
            <div key={r.rowIndex} className="flex items-center gap-2 rounded border border-border bg-surface p-2 text-xs">
              <span className={config.color}>{config.icon}</span>
              <span className="font-mono text-muted">#{r.rowIndex}</span>
              <span className={cn("font-semibold", config.color)}>{config.label}</span>
              {r.clientName && (
                <span className="truncate text-muted">"{r.clientName}"</span>
              )}
              {r.reportId && (
                <span className="text-muted">→ ID: {r.reportId.slice(0, 8)}...</span>
              )}
              {r.error && <span className="text-error">— {r.error}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// UNMATCHED CLIENT RESOLVER CARD (Sprint 4.9 P2)
// ============================================================================

/**
 * Card untuk resolve unmatched client setelah import selesai.
 *
 * Fitur:
 * - Auto-suggest top-3 client paling mirip (substring/overlap/levenshtein)
 * - Manual search dropdown (kalau suggestion tidak cocok)
 * - Bulk re-import setelah semua row di-resolve
 *
 * UX decisions:
 * - Card hanya muncul kalau ada unmatched row (tidak noise)
 * - Tiap row collapsible untuk hemat space
 * - Tombol "Re-import N row" hanya aktif kalau semua row sudah di-assign
 * - Tombol kecil "Skip" untuk dismiss row yang memang tidak perlu
 */
interface UnmatchedResolverCardProps {
  unmatchedRows: ImportResult["results"];
  previewRows: PreviewRow[];
  clients: Client[];
  clientOverrides: Record<number, string>;
  reimporting: boolean;
  onOverrideChange: (rowIndex: number, clientId: string) => void;
  onReimport: (rowIndexes: number[]) => void;
}

function UnmatchedResolverCard({
  unmatchedRows,
  previewRows,
  clients,
  clientOverrides,
  reimporting,
  onOverrideChange,
  onReimport,
}: UnmatchedResolverCardProps) {
  const [collapsedRows, setCollapsedRows] = useState<Set<number>>(
    () => new Set(unmatchedRows.map((r) => r.rowIndex))
  );

  // Rows yang sudah di-assign override → siap re-import
  const resolvedRows = unmatchedRows.filter((r) => clientOverrides[r.rowIndex]);
  const allResolved = resolvedRows.length === unmatchedRows.length;
  const resolvedRowIndexes = resolvedRows.map((r) => r.rowIndex);

  function toggleCollapse(rowIndex: number) {
    const next = new Set(collapsedRows);
    if (next.has(rowIndex)) next.delete(rowIndex);
    else next.add(rowIndex);
    setCollapsedRows(next);
  }

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      {/* Header */}
      <div className="mb-2 flex items-start gap-2">
        <Sparkles className="mt-0.5 shrink-0 text-primary" size={14} />
        <div className="flex-1">
          <p className="text-xs font-semibold text-primary">
            Auto-Suggest: {unmatchedRows.length} client tidak dikenali
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            Kami mencocokkan nama dengan client DB. Pilih suggestion yang benar untuk re-import,
            atau cari manual lewat dropdown.
          </p>
        </div>
      </div>

      {/* Per-row resolver */}
      <div className="space-y-1.5">
        {unmatchedRows.map((r) => {
          const previewRow = previewRows.find((p) => p.rowIndex === r.rowIndex);
          const sheetName = r.clientName || previewRow?.clientName || "(unknown)";
          const suggestions = findClientSuggestions(sheetName, clients, 3);
          const collapsed = collapsedRows.has(r.rowIndex);
          const currentOverride = clientOverrides[r.rowIndex];

          return (
            <div key={r.rowIndex} className="rounded bg-background p-2">
              {/* Header per row */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleCollapse(r.rowIndex)}
                  className="shrink-0 text-muted hover:text-foreground"
                  aria-label="Toggle detail"
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
                <span className="font-mono text-[10px] text-muted">#{r.rowIndex}</span>
                <span className="truncate text-xs font-semibold text-foreground">"{sheetName}"</span>
                {currentOverride && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                    <CheckCircle2 size={10} /> Resolved
                  </span>
                )}
              </div>

              {/* Body per row */}
              {!collapsed && (
                <div className="mt-2 space-y-2">
                  {/* Suggestion chips */}
                  {suggestions.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[10px] text-muted"><Lightbulb size={12} className="inline" /> Saran client:</p>
                      <div className="flex flex-wrap gap-1">
                        {suggestions.map(({ client, score, reason }) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => onOverrideChange(r.rowIndex, client.id)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors",
                              currentOverride === client.id
                                ? "border-success bg-success/10 text-success"
                                : "border-border bg-surface hover:border-primary hover:bg-primary/5"
                            )}
                            title={`Match reason: ${reason} (score: ${score})`}
                          >
                            {client.name}
                            <span className="text-[9px] opacity-70">({score})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-warning">
                      <AlertTriangle size={12} className="inline" /> Tidak ada suggestion yang cocok. Cari manual di bawah.
                    </p>
                  )}

                  {/* Manual search dropdown */}
                  <div>
                    <label className="mb-1 block text-[10px] text-muted">
                      Atau pilih manual:
                    </label>
                    <select
                      value={currentOverride || ""}
                      onChange={(e) => onOverrideChange(r.rowIndex, e.target.value)}
                      className="input py-1 text-xs"
                    >
                      <option value="">— Pilih client —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Re-import button */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2">
        <p className="text-[10px] text-muted">
          {resolvedRows.length}/{unmatchedRows.length} row resolved
        </p>
        <button
          type="button"
          onClick={() => onReimport(resolvedRowIndexes)}
          disabled={reimporting || resolvedRows.length === 0}
          className="btn-primary py-1 text-xs"
        >
          {reimporting ? (
            <>
              <Loader2 className="animate-spin" size={12} /> Re-importing...
            </>
          ) : (
            <>
              <Download size={12} /> Re-import {resolvedRows.length} row
            </>
          )}
        </button>
      </div>

      {/* Hint */}
      {allResolved && !reimporting && (
        <p className="mt-1.5 text-[10px] text-success">
          <CheckCircle2 size={12} className="inline" /> Semua row sudah di-assign. Klik "Re-import" untuk memproses ulang.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// BREAKDOWN TILE (sub-component)
// ============================================================================

function BreakdownTile({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded bg-background p-2",
        tone === "warning" && value > 0 && "ring-1 ring-warning/40"
      )}
    >
      <p className={cn("text-[9px] uppercase", tone === "warning" && value > 0 ? "text-warning" : "text-muted")}>
        {label}
      </p>
      <p className={cn("text-sm font-bold", tone === "warning" && value > 0 ? "text-warning" : "text-foreground")}>
        {value}
      </p>
      <p className="text-[8px] text-muted">{description}</p>
    </div>
  );
}
