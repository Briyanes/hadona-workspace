"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { cn, timeUntil, getInitials } from "@/lib/utils";

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  description: string;
  created_at: string;
  user?: { full_name: string; avatar_url: string | null };
}

const actionColors: Record<string, string> = {
  create: "bg-success/10 text-success",
  update: "bg-primary/10 text-primary",
  delete: "bg-danger/10 text-danger",
  status_change: "bg-warning/10 text-warning",
  assign: "bg-accent/10 text-accent",
  approve: "bg-success/10 text-success",
};

const entityIcons: Record<string, string> = {
  task: "📋",
  client: "🏢",
  report: "📊",
  ad_account: "📢",
  creative_request: "🎨",
};

export function ActivityLogWidget() {
  const supabase = createClient();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();

    // Subscribe to new activity
    const channel = supabase
      .channel("activity-logs-widget")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        () => loadLogs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadLogs() {
    try {
      const { data } = await supabase
        .from("activity_logs")
        .select("id, user_id, action, entity_type, description, created_at, user:profiles(full_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(15);

      setLogs((data as unknown as ActivityLog[]) || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Aktivitas Tim</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity size={18} className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Aktivitas Tim</h3>
        <span className="ml-auto flex h-2 w-2 animate-pulse rounded-full bg-success" />
      </div>

      {logs.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">Belum ada aktivitas</p>
      ) : (
        <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
          {logs.map((log) => {
            const actionColor = actionColors[log.action] || "bg-muted/10 text-muted";
            const entityIcon = entityIcons[log.entity_type] || "📌";

            return (
              <div key={log.id} className="flex items-start gap-2.5">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {log.user?.avatar_url ? (
                    <img src={log.user.avatar_url} alt={log.user?.full_name || ""} className="h-7 w-7 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-foreground">
                      {getInitials(log.user?.full_name)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">{entityIcon}</span>
                    <span className="truncate text-xs font-medium text-foreground">
                      {log.user?.full_name || "Unknown"}
                    </span>
                    <span className="text-[9px] text-muted">{timeUntil(log.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted leading-tight">{log.description}</p>
                  <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium", actionColor)}>
                    {log.action.replace("_", " ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}