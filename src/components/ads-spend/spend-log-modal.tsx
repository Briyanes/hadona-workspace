"use client";

import { X, Loader2, Trash2 } from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import type { AdAccount, SpendForm, SpendLog } from "./types";

interface SpendLogModalProps {
  open: boolean;
  onClose: () => void;
  modalAccount: AdAccount | null;
  spendForm: SpendForm;
  setSpendForm: (form: SpendForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  savingSpend: boolean;
  modalSpendLogs: SpendLog[];
  onDeleteLog: (id: string) => void;
}

export function SpendLogModal({
  open,
  onClose,
  modalAccount,
  spendForm,
  setSpendForm,
  onSubmit,
  savingSpend,
  modalSpendLogs,
  onDeleteLog,
}: SpendLogModalProps) {
  if (!open || !modalAccount) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Log Spend Harian</h2>
            <p className="text-xs text-muted">
              {modalAccount.client?.name} • {modalAccount.platform} •{" "}
              <span className="font-mono">{modalAccount.ad_account_id}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Form */}
          <form onSubmit={onSubmit} className="mb-4 space-y-3 rounded-lg bg-background p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tanggal</label>
                <input
                  type="date"
                  required
                  value={spendForm.log_date}
                  onChange={(e) => setSpendForm({ ...spendForm, log_date: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Spend (Rp) *
                </label>
                <input
                  type="number"
                  required
                  value={spendForm.spend}
                  onChange={(e) => setSpendForm({ ...spendForm, spend: e.target.value })}
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Impressions
                </label>
                <input
                  type="number"
                  value={spendForm.impressions}
                  onChange={(e) => setSpendForm({ ...spendForm, impressions: e.target.value })}
                  placeholder="0"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Clicks</label>
                <input
                  type="number"
                  value={spendForm.clicks}
                  onChange={(e) => setSpendForm({ ...spendForm, clicks: e.target.value })}
                  placeholder="0"
                  className="input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Conversions
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={spendForm.conversions}
                  onChange={(e) =>
                    setSpendForm({ ...spendForm, conversions: e.target.value })
                  }
                  placeholder="0"
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Revenue / Value (Rp)
              </label>
              <input
                type="number"
                value={spendForm.revenue}
                onChange={(e) => setSpendForm({ ...spendForm, revenue: e.target.value })}
                placeholder="0"
                className="input"
              />
              {spendForm.spend && spendForm.revenue && (
                <p className="mt-1 text-[10px] text-muted">
                  ROAS:{" "}
                  <strong className={cn(parseFloat(spendForm.revenue) / parseFloat(spendForm.spend) >= 1 ? "text-success" : "text-danger")}>
                    {(parseFloat(spendForm.revenue) / parseFloat(spendForm.spend)).toFixed(2)}x
                  </strong>
                </p>
              )}
            </div>
            <input
              type="text"
              value={spendForm.notes}
              onChange={(e) => setSpendForm({ ...spendForm, notes: e.target.value })}
              placeholder="Catatan (opsional)"
              className="input"
            />
            <div className="flex justify-end">
              <button type="submit" disabled={savingSpend} className="btn-primary">
                {savingSpend ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Simpan Log"
                )}
              </button>
            </div>
          </form>

          {/* History */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-muted">Riwayat (14 hari)</p>
            {modalSpendLogs.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">Belum ada log spend</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {modalSpendLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {new Date(log.log_date).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                      <span className="ml-2 text-muted">
                        {log.impressions > 0 && `${log.impressions.toLocaleString()} imp • `}
                        {log.clicks > 0 && `${log.clicks.toLocaleString()} click • `}
                        {log.revenue > 0 &&
                          `Rev: ${formatIDR(log.revenue)} • `}
                        {log.spend > 0 &&
                          log.revenue > 0 &&
                          `ROAS: ${(log.revenue / log.spend).toFixed(2)}x`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-warning">
                        {formatIDR(log.spend)}
                      </span>
                      <button
                        onClick={() => onDeleteLog(log.id)}
                        className="text-muted hover:text-danger"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-md bg-primary/5 p-3 text-[10px] text-muted">
            💡 <strong>Auto-update:</strong> Saat spend log disimpan, remaining budget ad account
            akan otomatis berkurang sesuai spend hari ini.
          </div>
        </div>
      </div>
    </div>
  );
}