"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Bell, CheckCheck, ListChecks, MessageSquare, FileWarning, Info } from "lucide-react";
import type { AppNotification } from "@/types";
import { cn, timeUntil } from "@/lib/utils";

const ICON_MAP: Record<string, typeof ListChecks> = {
  task_assigned: ListChecks,
  task_updated: ListChecks,
  report_deadline: FileWarning,
  mention: MessageSquare,
  general: Info,
};

const COLOR_MAP: Record<string, string> = {
  task_assigned: "bg-success/15 text-success",
  task_updated: "bg-accent/15 text-accent",
  report_deadline: "bg-warning/15 text-warning",
  mention: "bg-primary/15 text-primary",
  general: "bg-muted/15 text-muted",
};

export function NotificationBell() {
  const supabase = createClient();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    setNotifications((data as unknown as AppNotification[]) || []);

    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    setUnreadCount(count ?? 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription — use a ref to avoid re-subscribing on every render
  const loadRef = useRef(loadNotifications);
  loadRef.current = loadNotifications;

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        () => {
          loadRef.current();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
        },
        () => {
          loadRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAsRead(id: string, link: string | null) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_read: true }),
    });

    if (link) {
      setOpen(false);
      router.push(link);
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 transition-colors hover:bg-surface-hover"
        title="Notifications"
      >
        <Bell size={18} className="text-muted" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right animate-slide-up overflow-hidden rounded-lg border border-border bg-surface shadow-lg dropdown-panel sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-14 rounded-lg" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell size={32} className="mb-2 text-muted/40" />
                <p className="text-sm text-muted">No notifications yet</p>
                <p className="mt-1 text-xs text-muted/70">
                  You'll see task assignments and updates here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => {
                  const Icon = ICON_MAP[n.type] || Info;
                  const colorClass = COLOR_MAP[n.type] || COLOR_MAP.general;
                  return (
                    <button
                      key={n.id}
                      onClick={() => markAsRead(n.id, n.link)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover",
                        !n.is_read && "bg-primary/[0.03]"
                      )}
                    >
                      {/* Icon */}
                      <div className={cn("mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full", colorClass)}>
                        <Icon size={15} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-muted">
                          {timeUntil(n.created_at)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border p-2">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/settings/notifications");
                }}
                className="w-full rounded-md py-1.5 text-center text-xs font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                Notification Settings
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}