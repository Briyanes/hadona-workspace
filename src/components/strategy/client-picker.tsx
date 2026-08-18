"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Building2, Check, ChevronDown } from "lucide-react";

interface PickerClient {
  id: string;
  name: string;
  location?: string | null;
}

interface ClientPickerProps {
  clients: PickerClient[];
  selectedId: string | null;
  onChange: (id: string) => void;
  /** Client IDs yang sudah punya data strategy canvas */
  canvasIds?: Set<string>;
}

export function ClientPicker({ clients, selectedId, onChange, canvasIds }: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyCanvas, setOnlyCanvas] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = clients.find((c) => c.id === selectedId) || null;
  const hasCanvas = (id: string) => !!canvasIds?.has(id);
  const canvasCount = clients.filter((c) => hasCanvas(c.id)).length;

  const filtered = clients.filter((c) => {
    if (onlyCanvas && !hasCanvas(c.id)) return false;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative w-full max-w-md">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/50",
          open && "border-primary/50"
        )}
      >
        <Building2 size={14} className="shrink-0 text-muted" />
        <span className={cn("min-w-0 flex-1 truncate", selected ? "font-medium text-foreground" : "text-muted")}>
          {selected ? selected.name : `Pilih client (${clients.length} tersedia)`}
        </span>
        {selected && hasCanvas(selected.id) && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-success" title="Punya data canvas" />
        )}
        <ChevronDown size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[260px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {/* Search */}
          <div className="border-b border-border p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari client..."
              className="w-full rounded-md px-2 py-1.5 text-xs outline-none placeholder:text-muted focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Filter: hanya yang punya canvas */}
          <div className="border-b border-border bg-background px-3 py-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={onlyCanvas}
                onChange={(e) => setOnlyCanvas(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Hanya yang punya canvas ({canvasCount}/{clients.length})
            </label>
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">
                {onlyCanvas ? "Tidak ada client dengan canvas yang cocok" : "Client tidak ditemukan"}
              </p>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-background",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", hasCanvas(c.id) ? "bg-success" : "bg-border")}
                      title={hasCanvas(c.id) ? "Punya data canvas" : "Belum ada data canvas"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate font-medium", isSelected ? "text-primary" : "text-foreground")}>
                        {c.name}
                      </span>
                      {c.location && <span className="block text-[10px] text-muted">{c.location}</span>}
                    </span>
                    {!hasCanvas(c.id) && <span className="shrink-0 text-[9px] text-muted/70">kosong</span>}
                    {isSelected && <Check size={14} className="shrink-0 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}