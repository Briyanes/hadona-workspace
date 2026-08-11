"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Users, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

interface WorkloadMember {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  division: string | null;
  total_tasks: number;
  todo: number;
  in_progress: number;
  review: number;
  blocked: number;
  done: number;
  overdue: number;
}

export function TeamWorkloadWidget() {
  const supabase = createClient();
  const [members, setMembers] = useState<WorkloadMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkload();
  }, []);

  async function loadWorkload() {
    try {
      // Get all active task assignments with task details
      const { data: assignments, error } = await supabase
        .from("task_assignees")
        .select(
          `user_id,
           user:profiles(full_name, avatar_url, division),
           task:tasks(id, status, due_date)`
        );

      if (error) throw error;

      const today = new Date().toISOString().split("T")[0];

      // Group by user
      const workloadMap = new Map<string, WorkloadMember>();

      (assignments || []).forEach((a: unknown) => {
        const row = a as {
          user_id: string;
          user: { full_name: string | null; avatar_url: string | null; division: string | null };
          task: { id: string; status: string; due_date: string | null } | null;
        };

        if (!row.user_id) return;

        if (!workloadMap.has(row.user_id)) {
          workloadMap.set(row.user_id, {
            user_id: row.user_id,
            full_name: row.user?.full_name || "Unknown",
            avatar_url: row.user?.avatar_url || null,
            division: row.user?.division || null,
            total_tasks: 0,
            todo: 0,
            in_progress: 0,
            review: 0,
            blocked: 0,
            done: 0,
            overdue: 0,
          });
        }

        const member = workloadMap.get(row.user_id)!;
        const taskStatus = row.task?.status || "todo";
        const taskDue = row.task?.due_date;

        member.total_tasks++;

        if (taskStatus === "todo") member.todo++;
        else if (taskStatus === "in_progress") member.in_progress++;
        else if (taskStatus === "review") member.review++;
        else if (taskStatus === "blocked") member.blocked++;
        else if (taskStatus === "done") member.done++;

        // Check overdue (not done, past due_date)
        if (taskStatus !== "done" && taskDue && taskDue < today) {
          member.overdue++;
        }
      });

      // Convert to array and sort: most active first (exclude fully done)
      const sorted = Array.from(workloadMap.values())
        .filter((m) => m.total_tasks > 0)
        .sort((a, b) => {
          const aActive = a.total_tasks - a.done;
          const bActive = b.total_tasks - b.done;
          return bActive - aActive;
        });

      setMembers(sorted);
    } catch (err) {
      console.error("Workload error:", err);
    } finally {
      setLoading(false);
    }
  }

  function getWorkloadLevel(member: WorkloadMember): "light" | "normal" | "heavy" | "overloaded" {
    const active = member.total_tasks - member.done;
    if (member.blocked > 0 || member.overdue > 2) return "overloaded";
    if (active >= 5) return "heavy";
    if (active >= 2) return "normal";
    return "light";
  }

  const levelConfig = {
    light: { label: "Light", color: "text-success", dot: "bg-success" },
    normal: { label: "Normal", color: "text-primary", dot: "bg-primary" },
    heavy: { label: "Heavy", color: "text-warning", dot: "bg-warning" },
    overloaded: { label: "Overloaded", color: "text-danger", dot: "bg-danger" },
  };

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Team Workload</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Team Workload</h3>
        </div>
        <p className="py-4 text-center text-sm text-muted">Belum ada task yang di-assign</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Team Workload</h3>
        </div>
        <span className="text-xs text-muted">{members.length} members</span>
      </div>

      <div className="space-y-3">
        {members.slice(0, 8).map((m) => {
          const level = getWorkloadLevel(m);
          const config = levelConfig[level];
          const active = m.total_tasks - m.done;

          return (
            <div key={m.user_id} className="flex items-center gap-3">
              {/* Avatar */}
              <div className="relative shrink-0">
                {m.avatar_url ? (
                  <Avatar src={m.avatar_url} name={m.full_name} size={36} />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-xs font-semibold text-foreground">
                    {getInitials(m.full_name)}
                  </div>
                )}
                <div className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface", config.dot)} />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-foreground">{m.full_name}</span>
                  <span className="text-xs text-muted">{active} active</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  {/* Status pills */}
                  {m.in_progress > 0 && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                      {m.in_progress} doing
                    </span>
                  )}
                  {m.review > 0 && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      {m.review} review
                    </span>
                  )}
                  {m.todo > 0 && (
                    <span className="rounded bg-muted/15 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {m.todo} todo
                    </span>
                  )}
                  {m.blocked > 0 && (
                    <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      {m.blocked} blocked
                    </span>
                  )}
                  {(m.overdue > 0 || level === "overloaded") && (
                    <span className="flex items-center gap-0.5 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      <AlertTriangle size={8} />
                      {m.overdue > 0 ? `${m.overdue} overdue` : "overloaded"}
                    </span>
                  )}
                  {active === 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-success">
                      <CheckCircle2 size={10} /> All done
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-3">
          {(Object.keys(levelConfig) as Array<keyof typeof levelConfig>).map((key) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn("h-2 w-2 rounded-full", levelConfig[key].dot)} />
              <span className="text-[10px] text-muted">{levelConfig[key].label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}