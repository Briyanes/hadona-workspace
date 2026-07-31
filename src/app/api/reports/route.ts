import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/reports — Server-side handler untuk fitur lanjutan weekly reports
 *
 * Actions:
 *   POST { action: "pull-ads", clientId, periodStart, periodEnd }
 *     -> Aggregate ad_spend_logs untuk client+periode, return structured metrics
 *
 *   POST { action: "save-metrics", reportId, metrics[] }
 *     -> Simpan structured metrics ke report_metrics table (replace existing)
 *
 *   POST { action: "get-previous", clientId, periodEnd }
 *     -> Ambil report minggu sebelumnya untuk WoW comparison
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

        // Ambil semua ad_account milik client ini
        const { data: accounts, error: accountsError } = await supabase
          .from("ad_accounts")
          .select("id, platform, account_name")
          .eq("client_id", clientId);

        if (accountsError) throw accountsError;

        if (!accounts || accounts.length === 0) {
          return NextResponse.json({
            success: true,
            hasData: false,
            message: "Client ini belum punya ad account terdaftar",
            metrics: {},
            platformBreakdown: [],
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
          },
          platformBreakdown,
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