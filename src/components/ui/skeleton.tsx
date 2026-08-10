"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton — animated placeholder for loading states
 * Usage: <Skeleton className="h-4 w-24" />
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/50",
        className
      )}
    />
  );
}

/**
 * SkeletonTable — placeholder for table loading states
 * Renders rows x columns of skeleton bars
 */
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {/* Header */}
      <div className="flex gap-4 border-b border-border bg-surface px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="flex gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className={cn(
                "h-4",
                colIdx === 0 ? "w-32" : "flex-1",
                colIdx === cols - 1 && "w-20"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonCard — placeholder for card-style widgets
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

/**
 * SkeletonStat — placeholder for KPI/stat cards
 */
export function SkeletonStat() {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="mb-1 h-7 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}