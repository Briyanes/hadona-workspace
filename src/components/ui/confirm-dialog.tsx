"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./modal";

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "primary";
  loading?: boolean;
}

const variantStyles = {
  danger: "bg-danger text-white hover:bg-danger/90",
  warning: "bg-warning text-white hover:bg-warning/90",
  primary: "btn-primary",
};

export function ConfirmDialog({
  open,
  onConfirm,
  onClose,
  title = "Konfirmasi",
  message,
  confirmText = "Konfirmasi",
  cancelText = "Batal",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3">
        <div className="shrink-0">
          <div
            className={
              variant === "danger"
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-danger/10"
                : variant === "warning"
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-warning/10"
                : "flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"
            }
          >
            <AlertTriangle
              size={20}
              className={
                variant === "danger"
                  ? "text-danger"
                  : variant === "warning"
                  ? "text-warning"
                  : "text-primary"
              }
            />
          </div>
        </div>
        <p className="pt-1.5 text-sm text-gray-700">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm text-muted transition-colors hover:text-gray-900 disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${variantStyles[variant]}`}
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}