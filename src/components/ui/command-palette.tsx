'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type CommandItem = {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  section: string;
};

type SearchResult = {
  id: string;
  label: string;
  sublabel?: string;
  type: 'client' | 'task' | 'report' | 'invoice';
  url: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Navigation commands
  const navCommands: CommandItem[] = [
    { id: 'nav-dashboard', label: 'Dashboard', icon: '📊', section: 'Navigasi', action: () => router.push('/dashboard') },
    { id: 'nav-tasks', label: 'Tasks', icon: '✅', section: 'Navigasi', action: () => router.push('/tasks') },
    { id: 'nav-clients', label: 'Clients', icon: '👥', section: 'Navigasi', action: () => router.push('/clients') },
    { id: 'nav-reports', label: 'Reports', icon: '📈', section: 'Navigasi', action: () => router.push('/reports') },
    { id: 'nav-invoices', label: 'Invoices', icon: '🧾', section: 'Navigasi', action: () => router.push('/invoices') },
    { id: 'nav-calendar', label: 'Calendar', icon: '📅', section: 'Navigasi', action: () => router.push('/calendar') },
    { id: 'nav-ads-spend', label: 'Ads Spend', icon: '💰', section: 'Navigasi', action: () => router.push('/ads-spend') },
    { id: 'nav-users', label: 'Users', icon: '👤', section: 'Navigasi', action: () => router.push('/users') },
    { id: 'nav-strategy', label: 'Strategy', icon: '🎯', section: 'Navigasi', action: () => router.push('/strategy') },
    { id: 'nav-content-plans', label: 'Content Plans', icon: '📝', section: 'Navigasi', action: () => router.push('/content-plans') },
    { id: 'nav-creative', label: 'Creative', icon: '🎨', section: 'Navigasi', action: () => router.push('/creative') },
    { id: 'nav-timesheet', label: 'Timesheet', icon: '⏰', section: 'Navigasi', action: () => router.push('/timesheet') },
  ];

  const actionCommands: CommandItem[] = [
    { id: 'act-new-task', label: 'Buat Task Baru', icon: '➕', section: 'Aksi', action: () => router.push('/tasks?new=true') },
    { id: 'act-new-client', label: 'Tambah Client', icon: '👤', section: 'Aksi', action: () => router.push('/clients?new=true') },
    { id: 'act-new-invoice', label: 'Buat Invoice', icon: '💵', section: 'Aksi', action: () => router.push('/invoices?new=true') },
    { id: 'act-settings', label: 'Pengaturan', icon: '⚙️', section: 'Aksi', action: () => router.push('/settings') },
    { id: 'act-integrations', label: 'Integrasi & API', icon: '🔌', section: 'Aksi', action: () => router.push('/settings/integrations') },
    { id: 'act-theme', label: 'Ganti Tema', icon: '🌓', section: 'Aksi', action: () => {
      document.documentElement.classList.toggle('dark');
    }},
  ];

  const allCommands = [...navCommands, ...actionCommands];

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Filter commands
  const filteredCommands = query.trim()
    ? allCommands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

  // Combined list for display
  const displayItems: Array<{ type: 'command'; data: CommandItem } | { type: 'result'; data: SearchResult }> = [
    ...filteredCommands.map((c) => ({ type: 'command' as const, data: c })),
    ...searchResults.map((r) => ({ type: 'result' as const, data: r })),
  ];

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = displayItems[selectedIndex];
      if (!item) return;
      if (item.type === 'command') {
        item.data.action();
      } else {
        router.push(item.data.url);
      }
      setOpen(false);
      setQuery('');
    }
  }, [displayItems, selectedIndex, router]);

  if (!open) return null;

  // Group results
  const grouped: Record<string, typeof displayItems> = {};
  displayItems.forEach((item) => {
    const section = item.type === 'command' ? item.data.section : 'Hasil Pencarian';
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push(item);
  });

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={() => {
          setOpen(false);
          setQuery('');
        }}
      />

      {/* Palette */}
      <div className="fixed left-1/2 top-[15%] z-[9999] w-[90vw] max-w-2xl -translate-x-1/2 animate-in fade-in slide-in-from-top-4">
        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-2xl dark:border-[#334155] dark:bg-[#1e293b]">
          {/* Input */}
          <div className="flex items-center gap-3 border-b border-border px-4 dark:border-[#334155]">
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <svg className="h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cari halaman, client, task, atau invoice..."
              className="flex-1 bg-transparent py-4 text-sm text-foreground outline-none placeholder:text-muted dark:text-[#f1f5f9]"
            />
            <kbd className="hidden rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-muted dark:border-[#475569] dark:bg-[#0f172a] sm:block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {displayItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                {query.trim() ? 'Tidak ada hasil ditemukan' : 'Mulai mengetik untuk mencari...'}
              </div>
            ) : (
              Object.entries(grouped).map(([section, items]) => (
                <div key={section} className="mb-2">
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {section}
                  </div>
                  {items.map((item) => {
                    const idx = flatIndex++;
                    const isActive = idx === selectedIndex;
                    return (
                      <button
                        key={item.data.id}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={() => {
                          if (item.type === 'command') {
                            item.data.action();
                          } else {
                            router.push(item.data.url);
                          }
                          setOpen(false);
                          setQuery('');
                        }}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-primary text-white dark:bg-[#FFD60A] dark:text-[#0f172a]'
                            : 'text-muted hover:bg-surface-hover dark:text-[#cbd5e1] dark:hover:bg-[#334155]'
                        }`}
                      >
                        {item.type === 'command' ? (
                          <>
                            <span className="text-base">{item.data.icon}</span>
                            <span className="flex-1">{item.data.label}</span>
                            {item.data.shortcut && (
                              <kbd className={`text-xs ${isActive ? 'text-white/70 dark:text-[#0f172a]/70' : 'text-muted'}`}>
                                {item.data.shortcut}
                              </kbd>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-base">
                              {item.data.type === 'client' ? '👥' : item.data.type === 'task' ? '✅' : item.data.type === 'invoice' ? '🧾' : '📈'}
                            </span>
                            <div className="flex-1">
                              <div className="font-medium">{item.data.label}</div>
                              {item.data.sublabel && (
                                <div className={`text-xs ${isActive ? 'text-white/70 dark:text-[#0f172a]/70' : 'text-muted'}`}>
                                  {item.data.sublabel}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted dark:border-[#334155]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1 dark:border-[#475569] dark:bg-[#0f172a]">↑</kbd>
                <kbd className="rounded border border-border bg-surface px-1 dark:border-[#475569] dark:bg-[#0f172a]">↓</kbd>
                navigasi
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-surface px-1 dark:border-[#475569] dark:bg-[#0f172a]">↵</kbd>
                pilih
              </span>
            </div>
            <span className="text-xs">
              <kbd className="rounded border border-border bg-surface px-1 dark:border-[#475569] dark:bg-[#0f172a]">⌘K</kbd>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}