"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials, cn } from "@/lib/utils";
import { Check, ChevronDown, X, UserPlus } from "lucide-react";

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface AssigneePickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  compact?: boolean;
}

export function AssigneePicker({
  selectedIds,
  onChange,
  label = "Assignee",
  compact = false,
}: AssigneePickerProps) {
  const supabase = createClient();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

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

  async function loadUsers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    setUsers((data as unknown as User[]) || []);
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function remove(id: string) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUsers = users.filter((u) => selectedIds.includes(u.id));

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-900">{label}</label>

      {/* Selected assignees as chips */}
      <div className="flex flex-wrap gap-1.5">
        {selectedUsers.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 pl-1 pr-2 text-xs"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
              {getInitials(u.full_name)}
            </span>
            <span className="text-gray-700">{u.full_name}</span>
            <button
              type="button"
              onClick={() => remove(u.id)}
              className="text-muted hover:text-danger"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors",
            open
              ? "border-primary text-primary"
              : "border-border text-muted hover:border-primary hover:text-primary"
          )}
        >
          <UserPlus size={12} />
          {!compact && "Add Assignee"}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[220px] rounded-lg border border-border bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-border p-2">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama..."
              className="w-full rounded-md px-2 py-1.5 text-xs outline-none placeholder:text-muted focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* User list */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-center text-xs text-muted">User tidak ditemukan</p>
            ) : (
              filtered.map((u) => {
                const isSelected = selectedIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-gray-900">
                      {getInitials(u.full_name)}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{u.full_name}</p>
                      <p className="text-[10px] text-muted">{u.role.replace(/_/g, " ")}</p>
                    </div>
                    {isSelected && <Check size={14} className="text-primary" />}
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