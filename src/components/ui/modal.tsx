"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
  /** If true, the body scrolls and header/footer are sticky (for forms) */
  scrollable?: boolean;
}

const sizeMap = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  footer,
  scrollable = false,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Focus trap - focus the modal container on open
  useEffect(() => {
    if (open && modalRef.current) {
      const focusable = modalRef.current.querySelector<HTMLElement>(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "my-4 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl",
          sizeMap[size],
          scrollable ? "max-h-[calc(100dvh-2rem)]" : ""
        )}
      >
        {/* Sticky Header */}
        {(title || subtitle) && (
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
            <div>
              {title && (
                <h2 className="text-lg font-bold text-foreground">{title}</h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Body — scrollable if scrollable=true, otherwise static */}
        {scrollable ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        ) : (
          <div className="px-6 py-4">{children}</div>
        )}

        {/* Sticky Footer */}
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}