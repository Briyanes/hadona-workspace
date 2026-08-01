"use client";

import { cn } from "@/lib/utils";

interface LoadingStateProps {
  count?: number;
  variant?: "grid" | "list" | "cards";
  className?: string;
}

export function LoadingState({
  count = 6,
  variant = "grid",
  className,
}: LoadingStateProps) {
  const gridClass =
    variant === "grid"
      ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : variant === "cards"
      ? "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6"
      : "space-y-3";

  return (
    <div className={cn(gridClass, className)}>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton rounded-lg",
            variant === "list" ? "h-14" : variant === "cards" ? "h-24" : "h-32"
          )}
        />
      ))}
    </div>
  );
}