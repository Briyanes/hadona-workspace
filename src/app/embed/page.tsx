"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Loader, XCircle, TrendingUp, CheckSquare, Users, Megaphone } from "lucide-react";
import { formatIDR } from "@/lib/utils";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function EmbedDashboardPage() {
  const [stats, setStats] = useState<{
    activeClients: number;
    todoTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
    activeAds: number;
    totalBudget: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("No auth token provided");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    async function load() {
      const today = new Date().toISOString().split("T")[0];
      const [tasks, clients, adAccounts] = await Promise.all([
        supabase.from("tasks").select("status, due_date"),
        supabase.from("clients").select("id").eq("status", "active"),
        supabase.from("ad_accounts").select("daily_budget").eq("status", "active"),
      ]);

      const allTasks = (tasks.data as { status: string; due_date: string | null }[]) || [];

      setStats({
        activeClients: (clients.data || []).length,
        todoTasks: allTasks.filter((t) => t.status === "todo").length,
        inProgressTasks: allTasks.filter((t) => t.status === "in_progress").length,
        overdueTasks: allTasks.filter(
          (t) => t.due_date && t.due_date < today && t.status !== "done"
        ).length,
        activeAds: (adAccounts.data || []).length,
        totalBudget: (adAccounts.data || []).reduce(
          (sum, a) => sum + (a.daily_budget || 0),
          0
        ),
      });
      setLoading(false);
    }
    load().catch(() => {
      setError("Failed to load data");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 p-4 text-center">
        <XCircle className="text-danger" size={32} />
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  const cards = [
    { label: "Active Clients", value: stats?.activeClients ?? 0, icon: Users, color: "text-primary" },
    { label: "In Progress", value: stats?.inProgressTasks ?? 0, icon: CheckSquare, color: "text-warning" },
    { label: "Overdue", value: stats?.overdueTasks ?? 0, icon: XCircle, color: "text-danger" },
    { label: "Ad Accounts", value: stats?.activeAds ?? 0, icon: Megaphone, color: "text-success" },
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded gradient-primary text-[10px]">H</span>
          Hadona Dashboard
        </h1>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-md border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted">{card.label}</span>
                  <Icon size={14} className={card.color} />
                </div>
                <p className="mt-1 text-xl font-bold text-foreground">{card.value}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-border bg-gradient-to-br from-surface to-surface-hover p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted">Daily Ad Budget</p>
              <p className="text-lg font-bold text-foreground">{formatIDR(stats?.totalBudget ?? 0)}</p>
            </div>
            <TrendingUp className="text-success" size={20} />
          </div>
        </div>
      </div>
    </div>
  );
}