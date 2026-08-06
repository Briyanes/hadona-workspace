"use client";

import { useState, useEffect } from "react";
import { ObjectiveKey, OBJECTIVE_MAP, OBJECTIVE_GROUPS } from "@/lib/ad-objectives";
import { Target, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ObjectiveSelectorProps {
  value: string;
  onChange: (objective: ObjectiveKey) => void;
  className?: string;
}

export function ObjectiveSelector({ value, onChange, className }: ObjectiveSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = OBJECTIVE_MAP[value as ObjectiveKey];

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-objective-dropdown]")) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  // Filter by search
  const filteredGroups = OBJECTIVE_GROUPS.map((group) => ({
    ...group,
    objectives: group.objectives.filter((obj) => {
      const config = OBJECTIVE_MAP[obj];
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        config.label.toLowerCase().includes(q) ||
        config.description.toLowerCase().includes(q) ||
        config.platform.includes(q.toUpperCase())
      );
    }),
  })).filter((group) => group.objectives.length > 0);

  return (
    <div className={cn("relative", className)} data-objective-dropdown>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs hover:border-primary/50",
          open && "border-primary ring-1 ring-primary/20"
        )}
      >
        <span className="flex items-center gap-2">
          <Target size={14} className="text-primary" />
          <span className="font-medium text-gray-900">
            {selected?.label || "Select Objective"}
          </span>
          {selected && (
            <span className="badge bg-primary/10 text-primary text-[8px]">
              {selected.platform}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={cn("text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[calc(100vw-3rem)] max-w-[400px] right-0 sm:right-auto sm:left-0 rounded-lg border border-border bg-surface shadow-xl">
          {/* Search */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Cari objective..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-white py-2 sm:py-1.5 pl-8 pr-3 text-sm sm:text-xs outline-none focus:border-primary"
                autoFocus
              />
            </div>
          </div>

          {/* Grouped list */}
          <div className="max-h-[45vh] sm:max-h-[350px] overflow-y-auto overscroll-contain p-2">
            {filteredGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <p className="mb-1 px-1 text-[10px] sm:text-[9px] font-bold uppercase tracking-wider text-muted">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.objectives.map((objKey) => {
                    const obj = OBJECTIVE_MAP[objKey];
                    const isSelected = objKey === value;
                    return (
                      <button
                        key={objKey}
                        type="button"
                        onClick={() => {
                          onChange(objKey);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "w-full rounded-md px-2 py-2.5 sm:py-1.5 text-left transition-colors",
                          isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent/10 active:bg-accent/20"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-xs font-medium text-gray-900 leading-tight">{obj.label}</span>
                          <span className="badge bg-gray-100 text-muted text-[9px] sm:text-[8px] shrink-0">
                            {obj.platform}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted leading-snug hidden sm:block">{obj.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredGroups.length === 0 && (
              <p className="py-4 text-center text-xs text-muted">Tidak ada objective ditemukan</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}