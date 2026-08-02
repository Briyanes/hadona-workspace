import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { digestEmailTemplate, sendEmail } from "@/lib/email-templates";

/**
 * POST /api/cron/digest
 * Cron job untuk kirim daily/weekly digest email ke semua user yang opt-in.
 *
 * Vercel Cron setup (vercel.json):
 *   { "path": "/api/cron/digest?type=daily", "schedule": "0 0 * * *" }  → 07:00 WIB (UTC+7)
 *   { "path": "/api/cron/digest?type=weekly", "schedule": "0 23 * * 0" } → Senin 06:00 WIB
 *
 * Security: Uses CRON_SECRET header for authentication
 */

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = new URL(request.url).searchParams.get("type") || "daily";
    const period: "daily" | "weekly" = type === "weekly" ? "weekly" : "daily";

    // ── Service-role Supabase client ──
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Server config missing" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Get all users who opted in to this digest type ──
    const { data: profilesRaw } = await supabase
      .from("profiles")
      .select("id, email, full_name, notification_prefs")
      .eq("is_active", true)
      .eq("approval_status", "approved");

    const profiles = (profilesRaw as unknown as Array<{
      id: string;
      email: string;
      full_name: string;
      notification_prefs: Record<string, boolean> | null;
    }>) || [];

    const optInKey = period === "daily" ? "email_daily" : "email_weekly";
    const optedInUsers = profiles.filter((p) => p.notification_prefs?.[optInKey] === true);

    if (optedInUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No users opted in for ${period} digest`,
        sent: 0,
      });
    }

    // ── Date range ──
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - (period === "weekly" ? 7 : 1));
    const startDate = weekAgo.toISOString().split("T")[0];

    // ── Get global stats ──
    const [tasksRes, completedTasksRes, reportsRes] = await Promise.all([
      supabase.from("tasks").select("status, due_date, priority").in("status", ["todo", "in_progress", "review", "blocked"]),
      supabase.from("tasks").select("id").eq("status", "done").gte("updated_at", startDate),
      supabase.from("weekly_reports").select("id, status").in("status", ["draft", "submitted"]),
    ]);

    const allTasks = (tasksRes.data as Array<{ status: string; due_date: string | null; priority: string }>) || [];
    const overdueCount = allTasks.filter(
      (t) => t.due_date && t.due_date < today && t.status !== "done" && t.status !== "blocked"
    ).length;

    const completedCount = completedTasksRes.data?.length || 0;
    const pendingReportsCount = reportsRes.data?.length || 0;

    // ── Get weekly ad spend if applicable ──
    let weeklySpend = 0;
    let avgRoas = 0;

    if (period === "weekly") {
      const { data: metricsRaw } = await supabase
        .from("report_metrics")
        .select("metric_type, value")
        .in("metric_type", ["spend", "revenue"]);

      const metrics = (metricsRaw as Array<{ metric_type: string; value: number | null }>) || [];
      weeklySpend = metrics.filter((m) => m.metric_type === "spend").reduce((s, m) => s + (m.value || 0), 0);
      const revenue = metrics.filter((m) => m.metric_type === "revenue").reduce((s, m) => s + (m.value || 0), 0);
      avgRoas = weeklySpend > 0 ? revenue / weeklySpend : 0;
    }

    // ── Get active clients count ──
    const { count: activeClientsCount } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    // ── Get total daily budget ──
    const { data: adAccounts } = await supabase
      .from("ad_accounts")
      .select("daily_budget")
      .eq("status", "active");

    const totalBudget = ((adAccounts as Array<{ daily_budget: number | null }>) || []).reduce(
      (sum, a) => sum + (a.daily_budget || 0),
      0
    );

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://hadona.id"}/`;

    // ── Send digest to each user ──
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of optedInUsers) {
      try {
        // Get user's tasks
        const { data: userTasksRaw } = await supabase
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
          .limit(10);

        const userTasks = (userTasksRaw as unknown as Array<{
          title: string;
          priority: string;
          due_date: string | null;
          client?: { name: string } | null;
        }>) || [];

        const myTasks = userTasks.map((t) => ({
          title: t.title,
          client: t.client?.name || undefined,
          dueDate: t.due_date || undefined,
          priority: t.priority,
        }));

        const stats = {
          totalTasks: allTasks.length,
          completedTasks: completedCount,
          overdueTasks: overdueCount,
          pendingReports: pendingReportsCount,
          activeClients: activeClientsCount || 0,
          totalBudget,
          weeklySpend: period === "weekly" ? weeklySpend : undefined,
          avgRoas: period === "weekly" ? avgRoas : undefined,
        };

        const html = digestEmailTemplate({
          userName: user.full_name || user.email,
          period,
          stats,
          myTasks,
          dashboardUrl,
        });

        const subject = period === "weekly"
          ? `📊 Weekly Digest - Hadona Workspace`
          : `📋 Daily Digest - Hadona Workspace`;

        await sendEmail({
          to: user.email,
          subject,
          html,
        });

        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Unknown";
        errors.push(`${user.email}: ${msg}`);
        console.error(`[digest] Failed for ${user.email}:`, msg);
      }
    }

    console.log(`[digest/${period}] Sent: ${sent}, Failed: ${failed}`);

    return NextResponse.json({
      success: true,
      period,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[digest] Fatal error:", msg);
    return NextResponse.json({ error: "Digest cron failed: " + msg }, { status: 500 });
  }
}