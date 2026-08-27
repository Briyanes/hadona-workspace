"use client";

import { Loader2, KeyRound, ExternalLink, Shield, Zap } from "lucide-react";
import { Modal } from "@/components/ui/modal";

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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect dengan Token"
      subtitle="Alternatif jika OAuth tidak memungkinkan"
      size="md"
      scrollable
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Batal
          </button>
          <button type="submit" form="manual-token-form" disabled={savingToken} className="btn-primary">
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
        </>
      }
    >
      <form id="manual-token-form" onSubmit={onSubmit} className="space-y-4">
        {/* RECOMMENDED: System User Token */}
        <div className="rounded-lg border-2 border-green-300 bg-green-50 p-3 dark:border-green-700 dark:bg-green-950/40">
          <div className="mb-2 flex items-center gap-1.5">
            <Shield className="text-green-600" size={14} />
            <span className="text-sm font-bold text-green-800 dark:text-green-400">
              ⭐ REKOMENDASI: System User Token (Permanent)
            </span>
          </div>
          <p className="mb-2 text-[11px] text-muted dark:text-border">
            Token yang tidak pernah expired dan <strong>tidak butuh App Review</strong>. Cocok untuk agency.
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-[11px] text-muted">
            <li>
              Buka{" "}
              <a
                href="https://business.facebook.com/settings/security"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-green-700 hover:underline dark:text-green-400"
              >
                Meta Business Settings <ExternalLink size={10} />
              </a>
            </li>
            <li>
              Klik <strong>Users → System Users</strong> (kiri bawah)
            </li>
            <li>
              Klik <strong>Add → Create System User</strong> → isi nama (mis: "Hadona API")
            </li>
            <li>
              Klik user tersebut → <strong>Assign Assets</strong> → pilih <strong>Ad Accounts</strong>
            </li>
            <li>
              Pilih ad account yang ingin di-sync → centang <strong>Manage campaigns</strong>
            </li>
            <li>
              Klik <strong>Generate New Token</strong> → pilih App Anda
            </li>
            <li>
              Pilih permission:{" "}
              <code className="rounded bg-white px-1 dark:bg-gray-800">ads_read</code> (atau{" "}
              <code className="rounded bg-white px-1 dark:bg-gray-800">ads_management</code>)
            </li>
            <li>
              <strong>Copy token</strong> yang muncul, paste di bawah
            </li>
          </ol>
          <div className="mt-2 flex items-center gap-1.5 rounded bg-green-100 p-1.5 text-[10px] text-green-700 dark:bg-green-900/50 dark:text-green-400">
            <Zap size={10} />
            <span>Tidak expired • Tidak perlu App Review • Tidak perlu re-connect tiap 60 hari</span>
          </div>
        </div>

        {/* ALTERNATIVE: Graph API Explorer */}
        <details className="rounded-lg bg-background p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Alternatif: Graph API Explorer Token (expired 60 hari)
          </summary>
          <ol className="list-decimal space-y-1 pl-4 pt-2 text-[11px] text-muted">
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
              Klik <strong>"Generate Access Token"</strong> → centang{" "}
              <code className="rounded bg-white px-1 dark:bg-gray-800">ads_read</code>
            </li>
            <li>Copy token, paste di bawah</li>
          </ol>
          <p className="mt-2 text-[10px] text-muted">
            ⚠️ Token ini akan di-exchange jadi long-lived (60 hari). Setelah expired, harus diulang.
          </p>
        </details>

        {/* Token Input */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Access Token *</label>
          <textarea
            required
            rows={4}
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="EAAGm0PX4ZCwBO..."
            className="input resize-none font-mono text-[11px]"
            disabled={savingToken}
          />
          <p className="mt-1 text-[10px] text-muted">
            💡 Paste token di sini. Sistem akan otomatis deteksi apakah token permanent (System User)
            atau perlu di-exchange.
          </p>
        </div>
      </form>
    </Modal>
  );
}