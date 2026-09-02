"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Link2,
  Sparkles,
  Download,
  Database,
  TableProperties,
  FolderOpen,
  Clapperboard,
  Palette,
  Smartphone,
  Scissors,
  Upload,
  Banknote,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

// ============================================================================
// TYPES (sync dengan API route)
// ============================================================================

interface ImportSummary {
  sheet: string;
  table: string;
  found: number;
  inserted: number;
  skipped: number;
  errors: number;
  details: string[];
}

interface ImportResponse {
  success: boolean;
  dryRun?: boolean;
  message: string;
  sheetsProcessed: number;
  totalFound: number;
  totalInserted: number;
  totalErrors: number;
  summaries: ImportSummary[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultSheetUrl?: string;
  onImported?: () => void;
}

// Sheet mapping info untuk display
const SHEET_MAPPING: Array<{ sheet: string; table: string; icon: LucideIcon; color: string }> = [
  { sheet: "Dashboard Client", table: "clients", icon: FolderOpen, color: "text-blue-500" },
  { sheet: "Content Production", table: "tasks", icon: Clapperboard, color: "text-purple-500" },
  { sheet: "Creative Director", table: "tasks", icon: Palette, color: "text-pink-500" },
  { sheet: "Social Media Manager", table: "tasks", icon: Smartphone, color: "text-green-500" },
  { sheet: "Editor", table: "tasks", icon: Scissors, color: "text-orange-500" },
  { sheet: "SMM Upload", table: "content_uploads", icon: Upload, color: "text-cyan-500" },
  { sheet: "Bank Caption Ads", table: "caption_bank", icon: Banknote, color: "text-yellow-500" },
];

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy/pubhtml";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DashboardSheetImportModal({
  open,
  onClose,
  defaultSheetUrl = DEFAULT_SHEET_URL,
  onImported,
}: Props) {
  const [step, setStep] = useState<"url" | "result">("url");
  const [sheetUrl, setSheetUrl] = useState(defaultSheetUrl);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  function handleClose() {
    setStep("url");
    setSheetUrl(defaultSheetUrl);
    setDryRun(true);
    setResult(null);
    onClose();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetUrl.trim()) {
      toast.error("URL sheet wajib diisi");
      return;
    }
    if (!sheetUrl.includes("docs.google.com")) {
      toast.error("URL harus dari Google Spreadsheet");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/import/dashboard-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          dryRun,
        }),
      });
      const data = (await res.json()) as ImportResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Gagal import");

      setResult(data);
      setStep("result");

      if (data.dryRun) {
        toast.info(
          `🔍 Dry run: ${data.totalFound} records siap diimport dari ${data.sheetsProcessed} sheet`,
          { duration: 5000 }
        );
      } else {
        if (data.totalInserted > 0) {
          toast.success(
            `✅ ${data.totalInserted} records berhasil diimport!`,
            { duration: 6000 }
          );
          onImported?.();
        } else {
          toast.info("Import selesai tapi tidak ada record baru");
        }
      }
    } catch (err) {
      toast.error(
        "Gagal import: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoading(false);
    }
  }

  // Footer kondisional — hanya tampil di step result (dirender sticky oleh shared <Modal>)
  const footerNode =
    step === "result" ? (
      <button onClick={handleClose} className="btn-primary">
        Selesai
      </button>
    ) : undefined;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="xl"
      scrollable
      footer={footerNode}
      header={
        <div className="shrink-0">
          <div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Database className="text-primary" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Import Dashboard dari Google Sheet
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  Auto-import semua sheet: clients, tasks, uploads, captions
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Tutup modal"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          {/* ─── Stepper ─── */}
          <div className="flex items-center gap-2 border-b border-border bg-background/50 px-4 py-2 text-xs sm:px-6">
            <StepBadge
              label="1. URL & Preview"
              active={step === "url"}
              done={step === "result"}
            />
            <div className="h-px w-6 bg-border" />
            <StepBadge label="2. Result" active={step === "result"} done={false} />
          </div>
        </div>
      }
    >
          {step === "url" && (
            <form onSubmit={handleImport} className="space-y-4">
              {/* URL Input */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Google Sheet URL (Published to Web)
                </label>
                <div className="relative">
                  <Link2
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    size={16}
                  />
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml"
                    className="input pl-9"
                    autoFocus
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  Pastikan spreadsheet sudah di-publish:{" "}
                  <strong>File → Share → Publish to web</strong>
                </p>
              </div>

              {/* Sheet Mapping Preview */}
              <div className="rounded-md border border-border bg-background/50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <TableProperties size={14} /> Mapping Sheet → Database
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {SHEET_MAPPING.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded bg-surface px-2 py-1.5 text-xs"
                    >
                      <m.icon size={12} className="text-muted" />
                      <span className="text-muted">{m.sheet}</span>
                      <span className="text-border">→</span>
                      <code className={cn("font-mono font-semibold", m.color)}>
                        {m.table}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dry Run Toggle */}
              <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <AlertTriangle size={14} className="text-warning" />
                    Dry Run (Preview tanpa simpan)
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Cek dulu berapa record yang akan diimport sebelum benar-benar
                    disimpan ke database. <strong>Disarankan ON untuk test pertama.</strong>
                  </div>
                </div>
              </label>

              {/* Info */}
              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted">
                <p className="mb-1.5 font-semibold text-foreground">
                  ℹ️ Yang akan diimport:
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  <li>
                    <strong>~15 klien</strong> dari sheet Dashboard Client
                  </li>
                  <li>
                    <strong>~250 tasks</strong> dari Content Production, Creative
                    Director, SMM, Editor
                  </li>
                  <li>
                    <strong>~230 content uploads</strong> dari SMM Upload (caption +
                    link)
                  </li>
                  <li>
                    <strong>~109 caption ads</strong> dari Bank Caption Ads
                    ShumiJapan
                  </li>
                </ul>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button type="button" onClick={handleClose} className="btn-secondary">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />{" "}
                      {dryRun ? "Menganalisa..." : "Importing..."}
                    </>
                  ) : (
                    <>
                      {dryRun ? (
                        <>
                          <Sparkles size={14} /> Cek Data (Dry Run)
                        </>
                      ) : (
                        <>
                          <Download size={14} /> Import Semua Sheet
                        </>
                      )}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {step === "result" && result && (
            <ResultStep
              result={result}
              dryRun={dryRun}
              onDoRealImport={() => {
                setDryRun(false);
                setLoading(false);
                // Re-run without dry run
                handleImport({
                  preventDefault: () => {},
                } as React.FormEvent);
              }}
              loading={loading}
            />
          )}
    </Modal>
  );
}

// ============================================================================
// STEP BADGE
// ============================================================================

function StepBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
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
// RESULT STEP
// ============================================================================

function ResultStep({
  result,
  dryRun,
  onDoRealImport,
  loading,
}: {
  result: ImportResponse;
  dryRun: boolean;
  onDoRealImport: () => void;
  loading: boolean;
}) {
  const successRate =
    result.totalFound > 0
      ? Math.round((result.totalInserted / result.totalFound) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <div
        className={cn(
          "rounded-lg border p-4 text-center",
          result.totalErrors > 0
            ? "border-warning/30 bg-warning/5"
            : "border-success/30 bg-success/5"
        )}
      >
        {dryRun ? (
          <>
            <p className="text-sm font-semibold text-foreground">
              🔍 Dry Run Selesai
            </p>
            <p className="mt-1 text-2xl font-bold text-primary">
              {result.totalFound}
            </p>
            <p className="text-xs text-muted">
              records siap diimport dari {result.sheetsProcessed} sheet
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto mb-1 text-success" size={32} />
            <p className="text-2xl font-bold text-success">
              {result.totalInserted}
            </p>
            <p className="text-xs text-muted">
              records berhasil diimport • Success rate: {successRate}%
            </p>
          </>
        )}
      </div>

      {/* Per-Sheet Breakdown */}
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          📊 Detail per Sheet
        </p>
        <div className="space-y-2">
          {result.summaries.map((s, i) => {
            const mapping = SHEET_MAPPING.find(
              (m) =>
                m.sheet.toLowerCase() === s.sheet.toLowerCase() ||
                m.table === s.table
            );
            return (
              <div
                key={i}
                className={cn(
                  "rounded-md border p-3",
                  s.errors > 0
                    ? "border-warning/30 bg-warning/5"
                    : s.inserted > 0 || (dryRun && s.found > 0)
                    ? "border-success/30 bg-success/5"
                    : "border-border bg-surface"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{mapping ? <mapping.icon size={12} /> : <FileText size={12} />}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {s.sheet}
                      </p>
                      <p className="text-[10px] text-muted">
                        → <code>{s.table}</code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted">
                      Found: <strong className="text-foreground">{s.found}</strong>
                    </span>
                    {!dryRun && (
                      <span className="text-success">
                        Inserted: <strong>{s.inserted}</strong>
                      </span>
                    )}
                    {s.errors > 0 && (
                      <span className="text-error">
                        Errors: <strong>{s.errors}</strong>
                      </span>
                    )}
                  </div>
                </div>
                {/* Details (if any) */}
                {s.details.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto rounded bg-surface p-2 text-[10px] text-muted">
                    {s.details.slice(0, 8).map((d, j) => (
                      <div key={j}>{d}</div>
                    ))}
                    {s.details.length > 8 && (
                      <div className="text-muted italic">
                        ...dan {s.details.length - 8} lainnya
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action: Real Import */}
      {dryRun && result.totalFound > 0 && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium text-foreground">
            ✅ Data terlihat bagus! Mau langsung import sekarang?
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Klik tombol di bawah untuk menyimpan semua {result.totalFound}{" "}
            records ke database.
          </p>
          <button
            onClick={onDoRealImport}
            disabled={loading}
            className="btn-primary mt-2 w-full"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={14} /> Importing...
              </>
            ) : (
              <>
                <Download size={14} /> Import Sekarang ({result.totalFound}{" "}
                records)
              </>
            )}
          </button>
        </div>
      )}

      {/* Error Details */}
      {!dryRun && result.totalErrors > 0 && (
        <div className="rounded-md border border-error/30 bg-error/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-error">
            <XCircle size={14} /> {result.totalErrors} Error terjadi
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Sebagian data mungkin gagal karena validasi database (duplicate,
            foreign key, dll). Check console untuk detail.
          </p>
        </div>
      )}
    </div>
  );
}