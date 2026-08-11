"use client";

import { useEffect, useRef, useCallback } from "react";
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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Get all focusable elements inside the modal
   */
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null); // Exclude hidden elements
  }, []);

  /**
   * Handle Tab key for focus trapping within modal
   */
  const handleTabKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        e.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === first || document.activeElement === modalRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [getFocusableElements]
  );

  // Escape key, focus trap, body scroll lock
  useEffect(() => {
    if (!open) return;

    // Save currently focused element to restore later
    previouslyFocused.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else {
        handleTabKey(e);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      // Restore focus to the element that opened the modal
      previouslyFocused.current?.focus();
    };
  }, [open, onClose, handleTabKey]);

  // Focus first focusable element or close button on open
  useEffect(() => {
    if (open && modalRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        const focusable = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        focusable?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={(e) => {
        // Close on backdrop click only (not when clicking inside modal)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Modal dialog"}
        aria-describedby={subtitle ? "modal-subtitle" : undefined}
        tabIndex={-1}
        className={cn(
          "my-4 flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl",
          "focus:outline-none",
          sizeMap[size],
          scrollable ? "max-h-[calc(100dvh-2rem)]" : ""
        )}
      >
        {/* Sticky Header */}
        {(title || subtitle) && (
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
            <div>
              {title && (
                <h2 id="modal-title" className="text-lg font-bold text-foreground">{title}</h2>
              )}
              {subtitle && (
                <p id="modal-subtitle" className="mt-0.5 text-xs text-muted">{subtitle}</p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Tutup modal"
            >
              <X size={18} aria-hidden />
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