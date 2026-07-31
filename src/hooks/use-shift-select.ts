"use client";

import { useCallback, useRef } from "react";

/**
 * Hook untuk shift+click range selection di tabel.
 *
 * Cara kerja:
 * - Klik normal → toggle 1 baris
 * - Shift+klik → select semua baris dari anchor (klik terakhir) sampai baris ini
 *
 * @example
 * const { onRowToggle, onHeaderToggle } = useShiftSelect({
 *   data: filtered,
 *   getId: (a) => a.id,
 *   selectedIds,
 *   setSelectedIds,
 * });
 *
 * // Checkbox baris:
 * <input onChange={() => onRowToggle(item.id, index)} checked={selectedIds.has(item.id)} />
 *
 * // Checkbox header (select all):
 * <input onChange={() => onHeaderToggle()} checked={selectedIds.size === filtered.length} />
 */
interface UseShiftSelectOptions<T> {
  /** Array data yang sedang di-render di tabel */
  data: T[];
  /** Function untuk extract id dari item */
  getId: (item: T) => string;
  /** Set<string> dari id yang terpilih */
  selectedIds: Set<string>;
  /** Setter untuk update selectedIds */
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useShiftSelect<T>({
  data,
  getId,
  selectedIds,
  setSelectedIds,
}: UseShiftSelectOptions<T>) {
  // Index terakhir yang di-click (anchor untuk shift+click range)
  const lastClickedIndex = useRef<number | null>(null);

  /**
   * Toggle checkbox baris individual.
   * Pakai ini di onChange checkbox baris.
   */
  const onRowToggle = useCallback(
    (id: string, index: number, event?: React.MouseEvent | React.ChangeEvent) => {
      const isShiftClick =
        event && "shiftKey" in event && (event as React.MouseEvent).shiftKey;

      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (isShiftClick && lastClickedIndex.current !== null) {
          // ─── Shift+Click: Select range ───
          const start = Math.min(lastClickedIndex.current, index);
          const end = Math.max(lastClickedIndex.current, index);

          for (let i = start; i <= end; i++) {
            if (data[i]) {
              next.add(getId(data[i]));
            }
          }
        } else {
          // ─── Normal Click: Toggle single ───
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }

        return next;
      });

      lastClickedIndex.current = index;
    },
    [data, getId, setSelectedIds]
  );

  /**
   * Toggle select all (checkbox header).
   * Pakai ini di onChange checkbox header.
   */
  const onHeaderToggle = useCallback(() => {
    setSelectedIds((prev) => {
      // Jika semua sudah terpilih → clear, else → select all
      if (prev.size === data.length && data.length > 0) {
        lastClickedIndex.current = null;
        return new Set();
      }
      return new Set(data.map(getId));
    });
    lastClickedIndex.current = null;
  }, [data, getId, setSelectedIds]);

  /**
   * Clear semua selection + reset anchor.
   */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIndex.current = null;
  }, [setSelectedIds]);

  return {
    onRowToggle,
    onHeaderToggle,
    clearSelection,
  };
}