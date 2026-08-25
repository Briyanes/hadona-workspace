"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tombol "Load More" — visual identik dengan clients/reports page
 * agar konsisten satu design system.
 *
 * Usage:
 *   <LoadMore
 *     hasMore={hasMore}
 *     onLoadMore={loadMore}
 *     remaining={remaining}
 *     visibleCount={visibleItems.length}
 *     totalCount={filtered.length}
 *     itemLabel="productions"
 *   />
 */
export function LoadMore({
  hasMore,
  onLoadMore,
  remaining,
  visibleCount,
  totalCount,
  itemLabel = "items",
  spanFull = false,
}: {
  hasMore: boolean;
  onLoadMore: () => void;
  remaining: number;
  visibleCount: number;
  totalCount: number;
  itemLabel?: string;
  /** Set true bila dipakai di dalam CSS grid agar span penuh 1 baris */
  spanFull?: boolean;
}) {
  if (!hasMore) return null;

  return (
    <div className={cn("mt-6 flex flex-col items-center gap-2", spanFull && "col-span-full")}>
      <button
        onClick={onLoadMore}
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-primary"
      >
        <ChevronDown size={14} className="animate-bounce" />
        Load More
        <span className="text-muted">({remaining} remaining)</span>
      </button>
      <p className="text-[10px] text-muted">
        Showing {visibleCount} of {totalCount} {itemLabel}
      </p>
    </div>
  );
}