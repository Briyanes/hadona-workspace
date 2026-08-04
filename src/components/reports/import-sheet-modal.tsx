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

import { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Link2,
  Sparkles,
  Download,
} from "lucide-react";
import { cn, formatDate, formatIDR, formatCompact } from "@/lib/utils";

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
  };
  results: Array<{
    rowIndex: number;
    status: "imported" | "skipped" | "error";
    reportId?: string;
    clientId?: string;
    error?: string;
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

  async function handleImport() {
    if (selectedRowIndexes.size === 0) {
      toast.error("Pilih minimal 1 baris untuk diimport");
      return;
    }

    const rowsToImport = previewRows
      .filter((r) => selectedRowIndexes.has(r.rowIndex))
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

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        {/* ─── Header ─── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileSpreadsheet className="text-primary" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
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
            className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Stepper ─── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/50 px-4 py-2 text-xs">
          <StepBadge label="1. URL Sheet" active={step === "url"} done={step !== "url"} />
          <div className="h-px w-6 bg-border" />
          <StepBadge label="2. Preview" active={step === "preview"} done={step === "result"} />
          <div className="h-px w-6 bg-border" />
          <StepBadge label="3. Result" active={step === "result"} done={false} />
        </div>

        {/* ─── Body ─── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === "url" && (
            <form onSubmit={handlePreview} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
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
                <p className="mb-1.5 font-semibold text-gray-900">📋 Format sheet yang didukung:</p>
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
                    <div className="font-medium text-gray-900">Skip duplicate report</div>
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
                    <div className="font-medium text-gray-900">Auto-create client baru</div>
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
            <ResultStep result={importResult} />
          )}
        </div>

        {/* ─── Footer ─── */}
        {step === "preview" && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background/50 p-3">
            <div className="text-xs text-muted">
              <strong className="text-gray-900">{selectedRowIndexes.size}</strong> baris dipilih
              {previewStats && (
                <> • Match rate: {Math.round((previewStats.matched / Math.max(previewStats.total, 1)) * 100)}%</>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep("url")} className="btn-secondary">
                Kembali
              </button>
              <button
                onClick={handleImport}
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
        )}

        {step === "result" && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-background/50 p-3">
            <button onClick={handleClose} className="btn-primary">
              Selesai
            </button>
          </div>
        )}
      </div>
    </div>
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
      color: "bg-gray-200 text-gray-700",
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
          className="shrink-0 text-muted hover:text-gray-900"
          aria-label="Toggle detail"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900">
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
              <div className="font-semibold text-gray-900">{formatIDR(spend)}</div>
            </div>
          )}
          {purchases !== undefined && (
            <div className="text-right">
              <div className="text-muted">Result</div>
              <div className="font-semibold text-gray-900">{formatCompact(purchases)}</div>
            </div>
          )}
          {ctr !== undefined && (
            <div className="text-right">
              <div className="text-muted">CTR</div>
              <div className="font-semibold text-gray-900">{ctr.toFixed(2)}%</div>
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
                    <span className="font-semibold text-gray-900">{formatMetric(m.value, m.unit)}</span>
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
              <p className="rounded bg-surface p-2 text-xs text-gray-700 whitespace-pre-wrap">
                {row.analysisText}
              </p>
            </div>
          )}

          {/* Raw performance (collapsible) */}
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted hover:text-gray-900">
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
// RESULT STEP
// ============================================================================

function ResultStep({ result }: { result: ImportResult }) {
  const { summary, results } = result;
  const success = summary.imported > 0;

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
            <p className="text-base font-bold text-gray-900">
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

      {/* Per-row results */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900">Detail per baris:</p>
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