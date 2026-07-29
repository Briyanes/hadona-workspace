"use client";

import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "@/hooks/use-sortable-table";
import { cn } from "@/lib/utils";

interface SortableThProps {
  label: string;
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
}

/**
 * Sortable table header cell.
 * Shows a dynamic arrow indicator based on sort state.
 */
export function SortableTh({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className,
}: SortableThProps) {
  const isActive = activeKey === sortKey;

  return (
    <th
      className={cn(
        "px-4 py-3 font-medium select-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className
      )}
    >
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-primary",
          align === "right" && "flex-row-reverse",
          isActive && "text-primary"
        )}
      >
        <span className="text-xs uppercase">{label}</span>
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp size={12} className="text-primary" />
          ) : (
            <ArrowDown size={12} className="text-primary" />
          )
        ) : (
          <ArrowUpDown size={12} className="text-muted/50" />
        )}
      </button>
    </th>
  );
}