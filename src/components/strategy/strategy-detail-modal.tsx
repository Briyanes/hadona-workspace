"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Target, Edit3, Trash2, Calendar, FileText } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

interface StrategyDetail {
  id: string;
  title: string;
  description: string | null;
  period: string | null;
  client_id: string | null;
  created_at: string;
}

interface StrategyDetailModalProps {
  strategyId: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDeleted?: () => void;
}

export function StrategyDetailModal({ strategyId, onClose, onUpdated, onDeleted }: StrategyDetailModalProps) {
  const supabase = createClient();
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    period: "",
  });

  useEffect(() => {
    loadStrategy();
  }, [strategyId]);

  async function loadStrategy() {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_strategies")
      .select("id, title, description, period, client_id, created_at")
      .eq("id", strategyId)
      .single();

    if (error || !data) {
      toast.error("Gagal memuat strategi");
      setLoading(false);
      return;
    }

    const s = data as unknown as StrategyDetail;
    setStrategy(s);
    setEditForm({
      title: s.title || "",
      description: s.description || "",
      period: s.period || "",
    });
    setLoading(false);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.title.trim()) {
      toast.error("Judul strategi wajib diisi");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("client_strategies")
      .update({
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        period: editForm.period.trim() || null,
      } as never)
      .eq("id", strategyId);

    if (error) {
      toast.error("Gagal update strategi: " + error.message);
    } else {
      toast.success("Strategi berhasil diupdate!");
      setIsEditing(false);
      loadStrategy();
      onUpdated?.();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const { error } = await supabase.from("client_strategies").delete().eq("id", strategyId);
    if (error) {
      toast.error("Gagal hapus strategi: " + error.message);
      setConfirmDelete(false);
      return;
    }
    toast.success("Strategi berhasil dihapus");
    onDeleted?.();
    onClose();
  }

  return (
    <Modal
      open={loading || !!strategy}
      onClose={onClose}
      size="md"
      scrollable
      header={
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">{isEditing ? "Edit Strategi" : "Strategi Detail"}</h2>
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && (
              <>
                <button onClick={() => setIsEditing(true)} className="rounded p-2 text-muted hover:bg-background hover:text-primary" title="Edit Strategi">
                  <Edit3 size={16} />
                </button>
                <button onClick={handleDelete} className={cn("rounded p-2 hover:bg-background", confirmDelete ? "text-danger" : "text-muted hover:text-danger")} title="Delete Strategi">
                  <Trash2 size={16} />
                </button>
                {confirmDelete && (
                  <button onClick={() => setConfirmDelete(false)} className="rounded px-2 py-1 text-xs text-muted hover:text-foreground">
                    Batal
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="rounded p-2 text-muted hover:bg-background hover:text-foreground" aria-label="Tutup modal">
              <X size={18} />
            </button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-2">
          <div className="skeleton h-8 w-3/4 mb-4" />
          <div className="skeleton h-4 w-full mb-2" />
          <div className="skeleton h-32 w-full" />
        </div>
      ) : !strategy ? null : isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Judul *</label>
                <input type="text" required autoFocus value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Periode</label>
                <input type="text" value={editForm.period} onChange={(e) => setEditForm({ ...editForm, period: e.target.value })} placeholder="e.g., Q1 2025, Jan-Maret 2025" className="input" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Deskripsi</label>
                <textarea rows={6} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="input resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
              </div>
            </form>
      ) : (
            <div className="space-y-4">
              {/* Title */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Target size={18} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-foreground">{strategy.title}</h3>
                  {strategy.period && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Calendar size={12} />
                      <span>{strategy.period}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {strategy.description ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Deskripsi</p>
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="text-sm text-muted whitespace-pre-wrap">{strategy.description}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <FileText size={24} className="mx-auto mb-2 text-muted" />
                  <p className="text-sm text-muted">Belum ada deskripsi</p>
                </div>
              )}

              {/* Created date */}
              <div className="pt-2 text-xs text-muted">
                Dibuat: {formatDate(strategy.created_at, { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
      )}
    </Modal>
  );
}
