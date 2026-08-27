"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Fully custom header node — replaces the default title/subtitle row.
   *  Caller is responsible for its own layout & close button if needed. */
  header?: React.ReactNode;
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
  header,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Portal target guard — render on client only (SSR-safe).
   * Portal ke document.body memastikan overlay `fixed inset-0` tidak
   * terjebak containing-block ancestor (backdrop-blur/transform),
   * sehingga selalu menutup 100% viewport di semua halaman.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-0 sm:p-6"
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
          // Mobile: bottom-sheet full-bleed (mt-auto) + rounded top.
          // Desktop: centered (sm:my-auto) — margin auto collapse ke 0 saat
          // konten lebih tinggi dari viewport sehingga tetap bisa discroll.
          "mt-auto flex w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:my-auto sm:rounded-xl",
          "focus:outline-none",
          sizeMap[size],
          scrollable ? "max-h-[100dvh] sm:max-h-[calc(100dvh-3rem)]" : ""
        )}
      >
        {/* Sticky Header — custom node or default title/subtitle row */}
        {header ? (
          header
        ) : (title || subtitle) ? (
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-6">
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
        ) : null}

        {/* Body — scrollable if scrollable=true, otherwise static */}
        {scrollable ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        ) : (
          <div className="px-4 py-4 sm:px-6">{children}</div>
        )}

        {/* Sticky Footer — button stack full-width di mobile, row di desktop */}
        {footer && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Simple Card component for static content display
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
