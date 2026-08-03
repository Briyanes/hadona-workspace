"use client";

import { X, Loader2, KeyRound, ExternalLink } from "lucide-react";

interface ManualTokenModalProps {
  open: boolean;
  onClose: () => void;
  manualToken: string;
  setManualToken: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  savingToken: boolean;
}

export function ManualTokenModal({
  open,
  onClose,
  manualToken,
  setManualToken,
  onSubmit,
  savingToken,
}: ManualTokenModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-bold text-gray-900">Manual Token Connection</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable Body */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-lg bg-primary/5 p-3 text-xs text-gray-700">
              <p className="mb-2 font-semibold">📋 Cara dapatkan Access Token:</p>
              <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted">
                <li>
                  Buka{" "}
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  >
                    Graph API Explorer <ExternalLink size={10} />
                  </a>
                </li>
                <li>Pilih App Anda dari dropdown</li>
                <li>
                  Klik <strong>"Generate Access Token"</strong> → centang:{" "}
                  <code className="rounded bg-background px-1">ads_read</code>,{" "}
                  <code className="rounded bg-background px-1">ads_management</code>
                </li>
                <li>Copy token yang muncul, paste di bawah</li>
              </ol>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Access Token *
              </label>
              <textarea
                required
                rows={4}
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="EAAGm0PX4ZCwBO..."
                className="input font-mono text-[11px] resize-none"
                disabled={savingToken}
              />
              <p className="mt-1 text-[10px] text-muted">
                💡 Token akan otomatis di-exchange jadi long-lived (60 hari). Short-lived token
                hanya berlaku ~1 jam.
              </p>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted hover:text-gray-900"
            >
              Batal
            </button>
            <button type="submit" disabled={savingToken} className="btn-primary">
              {savingToken ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Menghubungkan...
                </>
              ) : (
                <>
                  <KeyRound size={14} /> Hubungkan
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}