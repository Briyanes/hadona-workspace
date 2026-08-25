"use client";

import { useEffect, useState } from "react";
import { formatIDR } from "@/lib/utils";

interface AEStats {
  totalClients: number;
  activeContracts: number;
  expiringContracts: number;
  monthlyRecurring: number;
  pendingInvoices: number;
  overdueAmount: number;
  collectedThisMonth: number;
  upcomingMeetings: number;
}

export function AEAnalyticsWidget({ userId }: { userId?: string }) {
  const [stats, setStats] = useState<AEStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/ae-analytics");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [userId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/50" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: "Total Clients",
      value: stats.totalClients.toString(),
      sub: `${stats.activeContracts} active contracts`,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "Monthly Recurring",
      value: formatIDR(stats.monthlyRecurring),
      sub: "From active contracts",
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      label: "Collected (This Month)",
      value: formatIDR(stats.collectedThisMonth),
      sub: `${stats.pendingInvoices} invoices pending`,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950/30",
    },
    {
      label: "Expiring Contracts",
      value: stats.expiringContracts.toString(),
      sub: stats.expiringContracts > 0 ? "Action needed!" : "All good",
      color: stats.expiringContracts > 0 ? "text-red-600" : "text-muted",
      bg: stats.expiringContracts > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-background dark:bg-gray-900/30",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
            <p className="text-xs font-medium text-muted">{card.label}</p>
            <p className={`mt-1 text-xl font-bold ${card.color}`}>{card.value}</p>
            <p className="mt-0.5 text-[10px] text-muted">{card.sub}</p>
          </div>
        ))}
      </div>

      {stats.overdueAmount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {formatIDR(stats.overdueAmount)} Overdue
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-500/70">
              Follow up with clients who have overdue invoices
            </p>
          </div>
        </div>
      )}

      {stats.upcomingMeetings > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
          <span className="text-lg">📅</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              {stats.upcomingMeetings} Upcoming Meeting{stats.upcomingMeetings > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-blue-600/70 dark:text-blue-500/70">
              Check calendar for details
            </p>
          </div>
        </div>
      )}
    </div>
  );
}