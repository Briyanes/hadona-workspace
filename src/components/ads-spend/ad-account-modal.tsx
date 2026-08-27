"use client";

import { Loader2, TrendingDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { AdAccountForm, ClientOption, TeamMember } from "./types";
import { calcDaysLeft } from "./types";

interface AdAccountModalProps {
  open: boolean;
  onClose: () => void;
  form: AdAccountForm;
  setForm: (form: AdAccountForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  editingId: string | null;
  clients: ClientOption[];
  team: TeamMember[];
}

export function AdAccountModal({
  open,
  onClose,
  form,
  setForm,
  onSubmit,
  saving,
  editingId,
  clients,
  team,
}: AdAccountModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingId ? "Edit Ad Account" : "Tambah Ad Account"}
      size="md"
      scrollable
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost">
            Batal
          </button>
          <button type="submit" form="ad-account-form" disabled={saving} className="btn-primary">
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Menyimpan...
              </>
            ) : editingId ? (
              "Update Ad Account"
            ) : (
              "Simpan Ad Account"
            )}
          </button>
        </>
      }
    >
      <form id="ad-account-form" onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-3 rounded-lg bg-background p-3">
          <p className="text-xs font-semibold uppercase text-muted">Info Akun</p>
          <select
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            className="input"
          >
            <option value="">— Pilih Client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="input"
            >
              <option value="META">Meta (Facebook/IG)</option>
              <option value="TIKTOK">TikTok Ads</option>
              <option value="GOOGLE">Google Ads</option>
              <option value="LINKEDIN">LinkedIn Ads</option>
              <option value="LAINNYA">Lainnya</option>
            </select>
            <input
              type="text"
              required
              value={form.ad_account_id}
              onChange={(e) => setForm({ ...form, ad_account_id: e.target.value })}
              placeholder="Ad Account ID (e.g. act_123456)"
              className="input font-mono text-[11px]"
            />
          </div>
          <input
            type="text"
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
            placeholder="Account Name (nama brand/campaign)"
            className="input"
          />
        </div>

        <div className="space-y-3 rounded-lg bg-background p-3">
          <p className="text-xs font-semibold uppercase text-muted">Budget</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted">Daily Budget (Rp)</label>
              <input
                type="number"
                value={form.daily_budget}
                onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                placeholder="0"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted">Remaining Budget (Rp)</label>
              <input
                type="number"
                value={form.remaining_budget}
                onChange={(e) => setForm({ ...form, remaining_budget: e.target.value })}
                placeholder="0"
                className="input"
              />
            </div>
          </div>
          {form.daily_budget && form.remaining_budget && (
            <p className="text-[10px] text-muted">
              <TrendingDown size={10} className="mr-1 inline" />
              Days left terhitung otomatis:{" "}
              <strong>
                {calcDaysLeft(
                  parseFloat(form.remaining_budget),
                  parseFloat(form.daily_budget)
                )}{" "}
                hari
              </strong>
            </p>
          )}
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="input"
          >
            <option value="active">Active</option>
            <option value="hold">Hold</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="space-y-3 rounded-lg bg-background p-3">
          <p className="text-xs font-semibold uppercase text-muted">PIC & Catatan</p>
          <select
            value={form.pic_id}
            onChange={(e) => setForm({ ...form, pic_id: e.target.value })}
            className="input"
          >
            <option value="">— Tanpa PIC —</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name || "Unknown"}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
            placeholder="Objective: Conversions, Traffic, Awareness..."
            className="input"
          />
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Catatan tambahan..."
            className="input resize-none"
          />
        </div>
      </form>
    </Modal>
  );
}