"use client";

import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  description?: string;
  icon?: React.ElementType;
  /** If provided, renders the full row with icon + label + description + toggle */
  showRow?: boolean;
}

/**
 * Shared Toggle switch component.
 * - If `showRow` is true: renders a full settings row (icon + label + description + toggle)
 * - If `showRow` is false/undefined: renders just the toggle button
 */
export function Toggle({ checked, onChange, label, description, icon: Icon, showRow = false }: ToggleProps) {
  const SwitchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 ease-in-out",
        checked
          ? "border-primary bg-primary"
          : "border-black/5 bg-gray-300 hover:bg-gray-400 dark:border-white/10 dark:bg-gray-600 dark:hover:bg-background0"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );

  if (!showRow) {
    return SwitchButton;
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn(
            "mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
            checked ? "bg-primary/15 text-primary" : "bg-surface text-muted/70 dark:bg-gray-800 dark:text-muted"
          )}>
            <Icon size={16} />
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-foreground dark:text-gray-100">{label}</p>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      </div>
      {SwitchButton}
    </div>
  );
}