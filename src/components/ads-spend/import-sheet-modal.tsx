"use client";

import { Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import type { AssignResult } from "./types";

interface ImportSheetModalProps {
  open: boolean;
  onClose: () => void;
  importMode: "assign" | "import";
  setImportMode: (mode: "assign" | "import") => void;
  sheetUrl: string;
  setSheetUrl: (val: string) => void;
  clientColumn: string;
  setClientColumn: (val: string) => void;
  accountColumn: string;
  setAccountColumn: (val: string) => void;
  sheetColumn: string;
  setSheetColumn: (val: string) => void;
  assignResult: AssignResult | null;
  setAssignResult: (val: AssignResult | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  importing: boolean;
}

export function ImportSheetModal({
  open,
  onClose,
  importMode,
  setImportMode,
  sheetUrl,
  setSheetUrl,
  clientColumn,
  setClientColumn,
  accountColumn,
  setAccountColumn,
  sheetColumn,
  setSheetColumn,
  assignResult,
  setAssignResult,
  onSubmit,
  importing,
}: ImportSheetModalProps) {
  const activeFormId = importMode === "assign" ? "import-assign-form" : "import-accounts-form";

  const closeAndReset = () => {
    onClose();
    setAssignResult(null);
  };

  return (
    <Modal
      open={open}
      onClose={closeAndReset}
      title="Import dari Google Sheet"
      subtitle="Auto-assign client ke ad account berdasarkan mapping di sheet"
      size="lg"
      scrollable
      footer={
        <>
          <button type="button" onClick={closeAndReset} className="btn-ghost">
            {importMode === "assign" ? "Tutup" : "Batal"}
          </button>
          <button type="submit" form={activeFormId} disabled={importing} className="btn-primary">
            {importing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {importMode === "assign" ? "Processing..." : "Importing..."}
              </>
            ) : importMode === "assign" ? (
              assignResult ? (
                <>🔄 Run Again</>
              ) : (
                <>
                  <Download size={14} className="rotate-180" /> Auto-Assign Now
                </>
              )
            ) : (
              <>
                <Download size={14} className="rotate-180" /> Import Now
              </>
            )}
          </button>
        </>
      }
    >
      {/* Mode Toggle */}
      <div className="mb-4 flex gap-2 rounded-lg bg-background p-1">
        <button
          type="button"
          onClick={() => {
            setImportMode("assign");
            setAssignResult(null);
          }}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
            importMode === "assign"
              ? "bg-primary text-white"
              : "text-muted hover:text-foreground"
          )}
        >
          🤖 Auto-Assign Client (Rekomendasi)
        </button>
        <button
          type="button"
          onClick={() => {
            setImportMode("import");
            setAssignResult(null);
          }}
          className={cn(
            "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
            importMode === "import"
              ? "bg-primary text-white"
              : "text-muted hover:text-foreground"
          )}
        >
          📥 Import Account Baru
        </button>
      </div>

      {importMode === "assign" ? (
        <>
          {/* Auto-Assign Mode Info */}
          <div className="mb-4 rounded-lg bg-success/5 p-3 text-xs text-muted">
            <p className="mb-1 font-semibold text-success">🤖 Cara kerja Auto-Assign:</p>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted">
              <li>
                Baca kolom <strong>Client</strong> (B) & <strong>Nomor Akun</strong> (F)
              </li>
              <li>Auto-create client baru jika belum ada di database</li>
              <li>
                Match <code className="rounded bg-background px-1">account_name</code> di DB dengan
                Nomor Akun (fuzzy + FB ID)
              </li>
              <li>
                Bulk update <code className="rounded bg-background px-1">client_id</code> untuk
                semua match
              </li>
              <li>Skipped values: "BM LAMA", "BM MILIK CLIENT", "TOTAL"</li>
            </ol>
          </div>

          <form id="import-assign-form" onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                URL Published Google Sheet *
              </label>
              <input
                type="url"
                required
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/..."
                className="input text-[11px]"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Kolom Nama Client
                </label>
                <select
                  value={clientColumn}
                  onChange={(e) => setClientColumn(e.target.value)}
                  className="input"
                >
                  <option value="A">A</option>
                  <option value="B">B (default)</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Kolom Nomor Akun
                </label>
                <select
                  value={accountColumn}
                  onChange={(e) => setAccountColumn(e.target.value)}
                  className="input"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                  <option value="E">E</option>
                  <option value="F">F (default)</option>
                </select>
              </div>
            </div>

            {/* Results Report */}
            {assignResult && (
              <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-bold text-foreground">📊 Hasil Auto-Assign:</p>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-success/10 p-2 text-center">
                    <p className="text-lg font-bold text-success">{assignResult.matched}</p>
                    <p className="text-[10px] text-muted">Di-assign</p>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2 text-center">
                    <p className="text-lg font-bold text-primary">
                      {assignResult.clients_created}
                    </p>
                    <p className="text-[10px] text-muted">Client Baru</p>
                  </div>
                  <div className="rounded-lg bg-warning/10 p-2 text-center">
                    <p className="text-lg font-bold text-warning">
                      {assignResult.already_assigned}
                    </p>
                    <p className="text-[10px] text-muted">Sudah Sesuai</p>
                  </div>
                  <div className="rounded-lg bg-danger/10 p-2 text-center">
                    <p className="text-lg font-bold text-danger">{assignResult.no_match}</p>
                    <p className="text-[10px] text-muted">Tidak Match</p>
                  </div>
                </div>

                {/* Matched Details */}
                {assignResult.matched_details.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-success">
                      ✅ Berhasil ({assignResult.matched_details.length}):
                    </p>
                    <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-surface p-2">
                      {assignResult.matched_details.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 border-b border-border/50 py-1 text-[10px] last:border-0"
                        >
                          <span className="font-medium text-foreground">{d.client}</span>
                          <span className="shrink-0 text-muted">
                            ← {d.nomorAkun.slice(0, 30)}
                            {d.nomorAkun.length > 30 ? "..." : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No-Match Details */}
                {assignResult.no_match_details.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-danger">
                      ⚠️ Tidak ditemukan match ({assignResult.no_match_details.length}):
                    </p>
                    <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-surface p-2">
                      {assignResult.no_match_details.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 border-b border-border/50 py-1 text-[10px] last:border-0"
                        >
                          <span className="font-medium text-foreground">{d.client}</span>
                          <span className="shrink-0 text-muted">
                            → {d.nomorAkun.slice(0, 30)}
                            {d.nomorAkun.length > 30 ? "..." : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-muted">
                      💡 Akun-akun ini mungkin sudah tidak aktif atau nama di sheet berbeda dengan
                      di database.
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
        </>
      ) : (
        <>
          {/* Import Mode Info */}
          <div className="mb-4 rounded-lg bg-primary/5 p-3 text-xs text-muted">
            <p className="mb-1 font-semibold">📋 Cara kerja Import:</p>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted">
              <li>Pilih kolom yang berisi nama ad account (default: E)</li>
              <li>Sistem akan parse dan import semua nama ke database</li>
              <li>Setelah import, klik "Sync Now" untuk match dengan Meta API</li>
            </ol>
          </div>

          <form id="import-accounts-form" onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                URL Published Google Sheet *
              </label>
              <input
                type="url"
                required
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/..."
                className="input text-[11px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Kolom Ad Account Name
              </label>
              <select
                value={sheetColumn}
                onChange={(e) => setSheetColumn(e.target.value)}
                className="input"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E (default)</option>
                <option value="F">F</option>
                <option value="G">G</option>
              </select>
              <p className="mt-1 text-[10px] text-muted">
                Kolom mana yang berisi nama ad account di sheet Anda?
              </p>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}