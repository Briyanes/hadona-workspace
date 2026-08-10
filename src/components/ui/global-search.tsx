"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, User, FileText, CreditCard, Loader2 } from "lucide-react";

interface SearchResult {
  type: "client" | "task" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_ICONS = {
  client: User,
  task: FileText,
  invoice: CreditCard,
} as const;

const TYPE_COLORS = {
  client: "text-blue-500",
  task: "text-amber-500",
  invoice: "text-emerald-500",
} as const;

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced search
  const performSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounce input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, performSearch]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev < results.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev > 0 ? prev - 1 : results.length - 1
      );
    } else if (e.key === "Enter" && highlightIdx >= 0 && results[highlightIdx]) {
      e.preventDefault();
      router.push(results[highlightIdx].href);
      setOpen(false);
      setQuery("");
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          size={16}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Cari klien, task, invoice..."
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm text-foreground placeholder:text-muted transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
        {loading && (
          <Loader2
            className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-muted"
            size={14}
          />
        )}
      </div>

      {/* Results dropdown */}
      {open && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-xl">
          {loading ? (
            <div className="px-4 py-6 text-center text-sm text-muted">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">
              Tidak ada hasil untuk "{query}"
            </div>
          ) : (
            <ul className="py-1">
              {results.map((result, idx) => {
                const Icon = TYPE_ICONS[result.type];
                const color = TYPE_COLORS[result.type];
                return (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-background ${
                        idx === highlightIdx ? "bg-background" : ""
                      }`}
                    >
                      <Icon className={`shrink-0 ${color}`} size={16} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {result.title}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {result.subtitle}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}