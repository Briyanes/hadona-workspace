import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/reports — Server-side handler untuk fitur lanjutan weekly reports
 *
 * Actions:
 *   POST { action: "pull-ads", clientId, periodStart, periodEnd }
 *     -> Aggregate ad_spend_logs untuk client+periode, return structured metrics + budget pacing
 *
 *   POST { action: "save-metrics", reportId, metrics[] }
 *     -> Simpan structured metrics ke report_metrics table (replace existing)
 *
 *   POST { action: "get-previous", clientId, periodStart }
 *     -> Ambil report minggu sebelumnya untuk WoW comparison
 *
 *   POST { action: "delete", reportId }
 *     -> Delete report + metrics terkait (admin/supabase bypass RLS)
 *
 *   POST { action: "clone", reportId, newPeriodStart, newPeriodEnd }
 *     -> Clone report (untuk template minggu depan)
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (!token) return null;

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const supabase = getAdminClient();

    switch (action) {
      // ─── PULL ADS DATA: Aggregate ad_spend_logs untuk client + periode ───
      case "pull-ads": {
        const { clientId, periodStart, periodEnd } = body as {
          clientId: string;
          periodStart: string;
          periodEnd: string;
        };

        if (!clientId || !periodStart || !periodEnd) {
          return NextResponse.json(
            { error: "clientId, periodStart, periodEnd wajib diisi" },
            { status: 400 }
          );
        }

        // Validasi tanggal
        if (new Date(periodStart) > new Date(periodEnd)) {
          return NextResponse.json(
            { error: "Periode mulai harus sebelum periode selesai" },
            { status: 400 }
          );
        }

        // Ambil semua ad_account milik client ini (+ budget untuk pacing)
        const { data: accounts, error: accountsError } = await supabase
          .from("ad_accounts")
          .select("id, platform, account_name, daily_budget, status")
          .eq("client_id", clientId);

        if (accountsError) throw accountsError;

        if (!accounts || accounts.length === 0) {
          return NextResponse.json({
            success: true,
            hasData: false,
            message: "Client ini belum punya ad account terdaftar",
            metrics: {},
            platformBreakdown: [],
            budgetPacing: null,
          });
        }

        const accountIds = accounts.map((a) => a.id);
        const accountMap = new Map(accounts.map((a) => [a.id, a]));

        // Ambil ad_spend_logs untuk periode tersebut
        const { data: logs, error: logsError } = await supabase
          .from("ad_spend_logs")
          .select("*")
          .in("ad_account_id", accountIds)
          .gte("log_date", periodStart)
          .lte("log_date", periodEnd);

        if (logsError) throw logsError;

        if (!logs || logs.length === 0) {
          return NextResponse.json({
            success: true,
            hasData: false,
            message: "Tidak ada data spend untuk periode ini",
            metrics: {},
            platformBreakdown: [],
            budgetPacing: null,
          });
        }

        // Aggregate total
        const totalSpend = logs.reduce((s, l) => s + (l.spend || 0), 0);
        const totalImpressions = logs.reduce((s, l) => s + (l.impressions || 0), 0);
        const totalClicks = logs.reduce((s, l) => s + (l.clicks || 0), 0);
        const totalConversions = logs.reduce((s, l) => s + (l.conversions || 0), 0);
        const totalRevenue = logs.reduce((s, l) => s + (l.revenue || 0), 0);

        // Calc derived metrics
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const cpr = totalConversions > 0 ? totalSpend / totalConversions : 0;
        const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
        const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
        const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
        const frequency = totalImpressions > 0 && totalClicks > 0 ? totalImpressions / (totalClicks / ctr * 100) : 0;

        // ─── Budget Pacing: target spend mingguan vs actual ───
        const periodDays =
          Math.ceil(
            (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1;
        const activeAccounts = accounts.filter((a) => a.status === "active");
        const totalDailyBudget = activeAccounts.reduce(
          (s, a) => s + (a.daily_budget || 0),
          0
        );
        const targetWeeklySpend = totalDailyBudget * periodDays;
        const pacingPercent =
          targetWeeklySpend > 0
            ? parseFloat(((totalSpend / targetWeeklySpend) * 100).toFixed(1))
            : 0;

        const budgetPacing = {
          targetSpend: targetWeeklySpend,
          actualSpend: totalSpend,
          pacingPercent,
          remainingBudget: Math.max(0, targetWeeklySpend - totalSpend),
          activeAccountCount: activeAccounts.length,
          periodDays,
        };

        // Aggregate per platform
        const platformAgg: Record<
          string,
          { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; accountCount: number }
        > = {};

        logs.forEach((log) => {
          const account = accountMap.get(log.ad_account_id);
          if (!account) return;
          const platform = account.platform || "Unknown";

          if (!platformAgg[platform]) {
            platformAgg[platform] = {
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              revenue: 0,
              accountCount: 0,
            };
          }

          platformAgg[platform].spend += log.spend || 0;
          platformAgg[platform].impressions += log.impressions || 0;
          platformAgg[platform].clicks += log.clicks || 0;
          platformAgg[platform].conversions += log.conversions || 0;
          platformAgg[platform].revenue += log.revenue || 0;
        });

        // Hitung unique account per platform
        accounts.forEach((a) => {
          const platform = a.platform || "Unknown";
          if (platformAgg[platform]) {
            platformAgg[platform].accountCount++;
          }
        });

        const platformBreakdown = Object.entries(platformAgg).map(([platform, data]) => ({
          platform,
          ...data,
          ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
          cpr: data.conversions > 0 ? data.spend / data.conversions : 0,
          roas: data.spend > 0 ? data.revenue / data.spend : 0,
        }));

        return NextResponse.json({
          success: true,
          hasData: true,
          accountCount: accounts.length,
          logCount: logs.length,
          metrics: {
            spend: totalSpend,
            impressions: totalImpressions,
            clicks: totalClicks,
            conversions: totalConversions,
            revenue: totalRevenue,
            ctr: parseFloat(ctr.toFixed(2)),
            cpr: parseFloat(cpr.toFixed(0)),
            cpc: parseFloat(cpc.toFixed(0)),
            cpm: parseFloat(cpm.toFixed(0)),
            roas: parseFloat(roas.toFixed(2)),
            frequency: parseFloat(frequency.toFixed(2)),
          },
          platformBreakdown,
          budgetPacing,
        });
      }

      // ─── SAVE METRICS: Simpan structured metrics ke report_metrics ───
      case "save-metrics": {
        const { reportId, metrics } = body as {
          reportId: string;
          metrics: Array<{
            metric_type: string;
            value: number | null;
            previous_value?: number | null;
            platform?: string | null;
          }>;
        };

        if (!reportId) {
          return NextResponse.json({ error: "reportId wajib diisi" }, { status: 400 });
        }

        // Hapus metrics lama untuk report ini (replace strategy)
        const { error: deleteError } = await supabase
          .from("report_metrics")
          .delete()
          .eq("weekly_report_id", reportId);

        if (deleteError) throw deleteError;

        // Insert metrics baru
        if (metrics && metrics.length > 0) {
          const payload = metrics.map((m) => ({
            weekly_report_id: reportId,
            metric_type: m.metric_type,
            value: m.value,
            previous_value: m.previous_value || null,
            platform: m.platform || null,
          }));

          const { error: insertError } = await supabase
            .from("report_metrics")
            .insert(payload);

          if (insertError) throw insertError;
        }

        return NextResponse.json({
          success: true,
          saved: metrics?.length || 0,
        });
      }

      // ─── GET PREVIOUS: Ambil report minggu sebelumnya untuk WoW ───
      case "get-previous": {
        const { clientId, periodStart } = body as {
          clientId: string;
          periodStart: string;
        };

        if (!clientId || !periodStart) {
          return NextResponse.json(
            { error: "clientId & periodStart wajib diisi" },
            { status: 400 }
          );
        }

        // Cari report dengan period_end < periodStart, urutkan terbaru
        const { data: prevReports, error: prevError } = await supabase
          .from("weekly_reports")
          .select("id, period_start, period_end")
          .eq("client_id", clientId)
          .lt("period_end", periodStart)
          .order("period_end", { ascending: false })
          .limit(1);

        if (prevError) throw prevError;

        if (!prevReports || prevReports.length === 0) {
          return NextResponse.json({
            success: true,
            hasPrevious: false,
            message: "Tidak ada report minggu sebelumnya",
            previousMetrics: {},
          });
        }

        const prevReport = prevReports[0];

        // Ambil metrics dari report sebelumnya
        const { data: prevMetrics, error: metricsError } = await supabase
          .from("report_metrics")
          .select("metric_type, value, platform")
          .eq("weekly_report_id", prevReport.id);

        if (metricsError) throw metricsError;

        // Aggregate (ambil value total per metric_type, abaikan platform untuk WoW utama)
        const aggregated: Record<string, number> = {};
        (prevMetrics || []).forEach((m) => {
          const key = m.metric_type;
          if (!aggregated[key]) aggregated[key] = 0;
          aggregated[key] += m.value || 0;
        });

        return NextResponse.json({
          success: true,
          hasPrevious: true,
          previousReport: prevReport,
          previousMetrics: aggregated,
        });
      }

      // ─── DELETE: Hapus report + metrics terkait (bypass RLS) ───
      case "delete": {
        const { reportId } = body as { reportId: string };

        if (!reportId) {
          return NextResponse.json({ error: "reportId wajib diisi" }, { status: 400 });
        }

        // Hapus metrics dulu (foreign key constraint)
        const { error: delMetricsErr } = await supabase
          .from("report_metrics")
          .delete()
          .eq("weekly_report_id", reportId);

        if (delMetricsErr) throw delMetricsErr;

        // Lalu hapus report
        const { error: delReportErr } = await supabase
          .from("weekly_reports")
          .delete()
          .eq("id", reportId);

        if (delReportErr) throw delReportErr;

        return NextResponse.json({
          success: true,
          deleted: reportId,
        });
      }

      // ─── CLONE: Duplicate report untuk periode baru ───
      case "clone": {
        const { reportId, newPeriodStart, newPeriodEnd, userId } = body as {
          reportId: string;
          newPeriodStart: string;
          newPeriodEnd: string;
          userId: string;
        };

        if (!reportId || !newPeriodStart || !newPeriodEnd) {
          return NextResponse.json(
            { error: "reportId, newPeriodStart, newPeriodEnd wajib diisi" },
            { status: 400 }
          );
        }

        // Ambil report source
        const { data: sourceReport, error: srcErr } = await supabase
          .from("weekly_reports")
          .select("*")
          .eq("id", reportId)
          .single();

        if (srcErr) throw srcErr;
        if (!sourceReport) {
          return NextResponse.json({ error: "Report source tidak ditemukan" }, { status: 404 });
        }

        // Insert report baru
        const { data: newReport, error: insertErr } = await supabase
          .from("weekly_reports")
          .insert({
            client_id: sourceReport.client_id,
            pic_id: userId || sourceReport.pic_id,
            period_start: newPeriodStart,
            period_end: newPeriodEnd,
            summary: "",
            performance_text: "",
            conclusion: "",
            action: "",
            status: "draft",
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        return NextResponse.json({
          success: true,
          newReportId: newReport.id,
          message: "Report berhasil di-clone. Metrik perlu di-pull ulang untuk periode baru.",
        });
      }

      // ─── CREATE SHARE LINK: Generate token untuk client portal ───
      case "create-share": {
        const { reportId } = body;
        if (!reportId) {
          return NextResponse.json({ error: "reportId required" }, { status: 400 });
        }

        // Generate random token (32 chars)
        const { randomBytes } = await import("crypto");
        const token = randomBytes(16).toString("hex");

        const { data: shareData, error: shareErr } = await supabase
          .from("shared_reports")
          .insert({
            report_id: reportId,
            token,
            created_by: user.id,
            is_active: true,
          })
          .select("token")
          .single();

        if (shareErr) throw shareErr;

        return NextResponse.json({
          success: true,
          token: shareData.token,
          url: `/shared/${shareData.token}`,
        });
      }

      // ─── GET SHARED REPORT: Public access via token ───
      case "get-shared": {
        const { token } = body;
        if (!token) {
          return NextResponse.json({ error: "token required" }, { status: 400 });
        }

        // Lookup token
        const { data: shareLink, error: linkErr } = await supabase
          .from("shared_reports")
          .select("report_id, is_active, expires_at")
          .eq("token", token)
          .single();

        if (linkErr || !shareLink) {
          return NextResponse.json({ error: "Link tidak ditemukan" }, { status: 404 });
        }

        if (!shareLink.is_active) {
          return NextResponse.json({ error: "Link telah dinonaktifkan" }, { status: 403 });
        }

        if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
          return NextResponse.json({ error: "Link telah kedaluwarsa" }, { status: 403 });
        }

        // Increment view count (best-effort, jangan block response kalau gagal)
        try {
          const { data: current } = await supabase
            .from("shared_reports")
            .select("view_count")
            .eq("token", token)
            .single();
          if (current) {
            await supabase
              .from("shared_reports")
              .update({ view_count: (current.view_count || 0) + 1 })
              .eq("token", token);
          }
        } catch {
          // view_count increment gagal = tidak fatal
        }

        // Get report data
        const { data: report, error: reportErr } = await supabase
          .from("weekly_reports")
          .select("*, client:clients(name), report_metrics(*)")
          .eq("id", shareLink.report_id)
          .single();

        if (reportErr) throw reportErr;

        return NextResponse.json({ report });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/reports] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}