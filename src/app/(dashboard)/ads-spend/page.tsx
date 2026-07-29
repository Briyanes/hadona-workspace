"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { formatIDR, cn } from "@/lib/utils";

interface AdAccount {
  id: string;
  platform: string;
  ad_account_id: string;
  account_name: string | null;
  objective: string | null;
  daily_budget: number | null;
  remaining_budget: number | null;
  days_left: number | null;
  status: string;
  notes: string | null;
  client?: { name: string };
}

export default function AdsSpendPage() {
  const supabase = createClient();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ad_accounts")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      setAccounts((data as unknown as AdAccount[]) || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const filtered = accounts.filter((a) => {
    const matchSearch =
      !search ||
      a.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.ad_account_id.includes(search) ||
      a.account_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalDaily = accounts
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (a.daily_budget || 0), 0);

  const platformColors: Record<string, string> = {
    META: "bg-primary/20 text-primary",
    Google: "bg-warning/20 text-warning",
    TikTok: "bg-dark text-white",
  };

  const statusColors: Record<string, string> = {
    active: "bg-success/20 text-success",
    inactive: "bg-surface text-muted",
    hold: "bg-warning/20 text-warning",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ads Spend Tracker</h1>
          <p className="text-sm text-muted">
            Total Budget Harian: <span className="font-semibold text-white">{formatIDR(totalDaily)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari client atau ad account..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="hold">Hold</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr className="text-left text-xs uppercase text-muted">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Ad Account ID</th>
              <th className="px-4 py-3 font-medium">Objective</th>
              <th className="px-4 py-3 text-right font-medium">Daily Budget</th>
              <th className="px-4 py-3 text-right font-medium">Remaining</th>
              <th className="px-4 py-3 text-center font-medium">Days Left</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Tidak ada data</td></tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3 font-medium text-white">{a.client?.name || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("badge", platformColors[a.platform] || "bg-surface text-muted")}>
                      {a.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{a.ad_account_id}</td>
                  <td className="px-4 py-3 text-muted">{a.objective || "-"}</td>
                  <td className="px-4 py-3 text-right font-medium text-white">{formatIDR(a.daily_budget)}</td>
                  <td className="px-4 py-3 text-right text-muted">{formatIDR(a.remaining_budget)}</td>
                  <td className="px-4 py-3 text-center">
                    {a.days_left !== null && a.days_left <= 3 ? (
                      <span className="badge bg-danger/20 text-danger">
                        <AlertTriangle size={10} /> {a.days_left}d
                      </span>
                    ) : (
                      <span className="text-muted">{a.days_left ? `${a.days_left}d` : "-"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("badge", statusColors[a.status] || statusColors.inactive)}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}