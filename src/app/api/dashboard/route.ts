import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth-api";

/**
 * GET /api/dashboard
 * Aggregated dashboard data in a single server-side request.
 * Replaces 6+ sequential client-side fetches.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user || auth.error) return auth.error!;

    const { user, supabase } = auth;
    const today = new Date().toISOString().split("T")[0];

    // ── Parallel batch #1: Basic stats ──
    const [tasks, clients, adAccounts, profiles, profileData] = await Promise.all([
      supabase.from("tasks").select("status, due_date, priority"),
      supabase.from("clients").select("status, contract_value"),
      supabase.from("ad_accounts").select("daily_budget, status").eq("status", "active"),
      supabase.from("profiles").select("id").eq("is_active", true),
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    ]);

    const allTasks = (tasks.data as { status: string; due_date: string | null; priority: string }[]) || [];
    const clientList = (clients.data as { status: string; contract_value: number | null }[]) || [];
    const accountList = (adAccounts.data as { daily_budget: number | null; status: string }[]) || [];
    const profileList = (profiles.data as { id: string }[]) || [];

    const stats = {
      totalTasks: allTasks.length,
      todoTasks: allTasks.filter((t) => t.status === "todo").length,
      inProgressTasks: allTasks.filter((t) => t.status === "in_progress").length,
      doneTasks: allTasks.filter((t) => t.status === "done").length,
      overdueTasks: allTasks.filter(
        (t) => t.due_date && t.due_date < today && t.status !== "done" && t.status !== "blocked"
      ).length,
      activeClients: clientList.filter((c) => c.status === "active").length,
      activeAdAccounts: accountList.length,
      totalBudget: accountList.reduce((sum, a) => sum + (a.daily_budget || 0), 0),
      totalMrr: clientList
        .filter((c) => c.status === "active" || c.status === "onboarding")
        .reduce((sum, c) => sum + (c.contract_value || 0), 0),
      teamMembers: profileList.length,
    };

    const userName = (profileData.data as { full_name: string } | null)?.full_name || "";

    // ── Parallel batch #2: Reports + My Tasks + Activities ──
    const [reportsRes, myTasksRes, activityRes] = await Promise.all([
      supabase
        .from("weekly_reports")
        .select(`
          id, status, period_start, period_end,
          client:clients(name),
          report_metrics(metric_type, value)
        `)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("tasks")
        .select(`
          id, title, status, priority, due_date,
          client:clients(name),
          task_assignees!inner(user_id)
        `)
        .eq("task_assignees.user_id", user.id)
        .in("status", ["todo", "in_progress", "review"])
        .or(`due_date.lte.${today},due_date.is.null`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(8),
      supabase
        .from("activity_logs")
        .select(`
          id, description, entity_type, action, created_at,
          client:clients(name)
        `)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    // ── Process Ads KPI ──
    let adsKpi = null;

    interface ReportRow {
      id: string;
      status: string;
      period_start: string;
      period_end: string;
      client?: { name: string } | null;
      report_metrics?: Array<{ metric_type: string; value: number | null }>;
    }

    const reports = (reportsRes.data as unknown as ReportRow[]) || [];

    if (reports.length > 0) {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentReports = reports.filter((r) => new Date(r.period_end) >= weekAgo);

      const clientRoasMap: Record<string, { spend: number; revenue: number }> = {};
      let totalSpend = 0;
      let totalConv = 0;
      let totalRev = 0;

      recentReports.forEach((r) => {
        const clientName = r.client?.name || "Unknown";
        const metrics = r.report_metrics || [];
        const spend = metrics.filter((m) => m.metric_type === "spend").reduce((s, m) => s + (m.value || 0), 0);
        const conv = metrics.filter((m) => m.metric_type === "conversions").reduce((s, m) => s + (m.value || 0), 0);
        const rev = metrics.filter((m) => m.metric_type === "revenue").reduce((s, m) => s + (m.value || 0), 0);

        totalSpend += spend;
        totalConv += conv;
        totalRev += rev;

        if (!clientRoasMap[clientName]) clientRoasMap[clientName] = { spend: 0, revenue: 0 };
        clientRoasMap[clientName].spend += spend;
        clientRoasMap[clientName].revenue += rev;
      });

      const clientRoasList = Object.entries(clientRoasMap)
        .map(([name, data]) => ({ name, roas: data.spend > 0 ? data.revenue / data.spend : 0 }))
        .filter((c) => c.roas > 0)
        .sort((a, b) => b.roas - a.roas);

      const pendingReports = reports
        .filter((r) => r.status === "draft" || r.status === "submitted")
        .slice(0, 5)
        .map((r) => ({ id: r.id, clientName: r.client?.name || "Unknown", periodEnd: r.period_end, status: r.status }));

      adsKpi = {
        weeklySpend: totalSpend,
        weeklyConversions: totalConv,
        weeklyRevenue: totalRev,
        avgRoas: totalSpend > 0 ? totalRev / totalSpend : 0,
        bestClient: clientRoasList[0] || null,
        worstClient: clientRoasList[clientRoasList.length - 1] || null,
        reportDrafts: reports.filter((r) => r.status === "draft").length,
        reportSubmitted: reports.filter((r) => r.status === "submitted").length,
        pendingReports,
      };
    }

    return NextResponse.json({
      stats,
      userName,
      adsKpi,
      myTasks: myTasksRes.data || [],
      activities: activityRes.data || [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Dashboard fetch failed: " + msg }, { status: 500 });
  }
}