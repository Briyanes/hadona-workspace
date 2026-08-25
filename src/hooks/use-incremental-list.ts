"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Load More pagination — pattern konsisten dengan clients/reports page.
 * Render hanya `visibleCount` item pertama untuk performance.
 *
 * Usage:
 *   const { visibleItems, loadMore, hasMore } = useIncrementalList(filtered, {
 *     resetKey: `${search}|${statusFilter}`,
 *   });
 */
export function useIncrementalList<T>(
  items: T[],
  options?: { pageSize?: number; resetKey?: string }
) {
  const pageSize = options?.pageSize ?? 12;
  const resetKey = options?.resetKey ?? "";

  const [visibleCount, setVisibleCount] = useState(pageSize);

  // Reset ke page pertama saat filter/search berubah
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [resetKey, pageSize]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount]
  );

  const hasMore = items.length > visibleCount;
  const remaining = Math.max(0, items.length - visibleCount);

  const loadMore = () => setVisibleCount((c) => c + pageSize);

  return { visibleItems, visibleCount, hasMore, remaining, loadMore };
}