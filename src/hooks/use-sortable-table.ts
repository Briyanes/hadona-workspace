"use client";

import { useState, useMemo, useCallback } from "react";

export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  key: string | null;
  direction: SortDirection;
}

interface UseSortableOptions<T> {
  data: T[];
  initialSort?: SortState;
}

/**
 * Generic sorting hook for tables.
 *
 * Click cycle: null → asc → desc → null
 * - Smart value extraction: handles nested objects (e.g. "client.name")
 * - Smart type detection: numbers sorted numerically, dates chronologically, strings alphabetically
 * - Case-insensitive for strings
 */
export function useSortable<T extends Record<string, any>>({
  data,
  initialSort = { key: null, direction: null },
}: UseSortableOptions<T>) {
  const [sortState, setSortState] = useState<SortState>(initialSort);

  const toggleSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (prev.key !== key) {
        return { key, direction: "asc" };
      }
      // Same key, cycle through: asc → desc → null
      if (prev.direction === "asc") return { key, direction: "desc" };
      if (prev.direction === "desc") return { key: null, direction: null };
      return { key, direction: "asc" };
    });
  }, []);

  const sortedData = useMemo(() => {
    if (!sortState.key || !sortState.direction) return data;

    const key = sortState.key;
    const dir = sortState.direction === "asc" ? 1 : -1;

    return [...data].sort((a, b) => {
      // Support nested keys like "client.name"
      const valueA = key.includes(".")
        ? key.split(".").reduce((obj: any, k: string) => obj?.[k], a)
        : a[key];
      const valueB = key.includes(".")
        ? key.split(".").reduce((obj: any, k: string) => obj?.[k], b)
        : b[key];

      // Handle null/undefined (push to bottom)
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return 1;
      if (valueB == null) return -1;

      // Numeric comparison
      if (typeof valueA === "number" && typeof valueB === "number") {
        return (valueA - valueB) * dir;
      }

      // String comparison (case-insensitive)
      const strA = String(valueA).toLowerCase();
      const strB = String(valueB).toLowerCase();
      return strA.localeCompare(strB) * dir;
    });
  }, [data, sortState]);

  return { sortedData, sortState, toggleSort };
}