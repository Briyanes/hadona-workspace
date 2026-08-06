import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { aggregateBaseMetrics, calculateAllMetrics } from "@/lib/metric-formulas";
import { MetricKey, OBJECTIVE_MAP } from "@/lib/ad-objectives";

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
 *
 *   POST { action: "bulk-delete", reportIds[] }
 *     -> Batch delete multiple reports + metrics (admin only)
 *
 *   POST { action: "bulk-update-status", reportIds[], status }
 *     -> Batch update status (draft/submitted/reviewed)
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

        // Ambil semua ad_account milik client ini (+ budget + objective untuk pacing)
        const { data: accounts, error: accountsError } = await supabase
          .from("ad_accounts")
          .select("id, platform, account_name, daily_budget, status, objective")
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
            objective: "SALES",
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
            objective: "SALES",
          });
        }

        // ─── Deteksi objective dominan dari ad_accounts ───
        const objectiveCounts: Record<string, number> = {};
        accounts.forEach((a) => {
          const obj = (a as { objective?: string }).objective || "SALES";
          objectiveCounts[obj] = (objectiveCounts[obj] || 0) + 1;
        });
        const dominantObjective = Object.entries(objectiveCounts).sort(
          (a, b) => b[1] - a[1]
        )[0]?.[0] || "SALES";

        // ─── Map logs ke BaseMetrics format ───
        const baseLogs = logs.map((l) => ({
          spend: l.spend || 0,
          impressions: l.impressions || 0,
          clicks: l.clicks || 0,
          reach: (l as { reach?: number }).reach || 0,
          link_clicks: (l as { link_clicks?: number }).link_clicks || 0,
          outbound_clicks: (l as { outbound_clicks?: number }).outbound_clicks || 0,
          messaging_conversations_started: (l as { messaging_conversations_started?: number }).messaging_conversations_started || 0,
          content_views: (l as { content_views?: number }).content_views || 0,
          adds_to_cart: (l as { adds_to_cart?: number }).adds_to_cart || 0,
          purchases: (l as { purchases?: number }).purchases || (l.conversions || 0),
          purchase_value: (l as { purchase_value?: number }).purchase_value || (l.revenue || 0),
          landing_page_views: (l as { landing_page_views?: number }).landing_page_views || 0,
          checkouts_initiated: (l as { checkouts_initiated?: number }).checkouts_initiated || 0,
          instagram_follows: (l as { instagram_follows?: number }).instagram_follows || 0,
          instagram_profile_visits: (l as { instagram_profile_visits?: number }).instagram_profile_visits || 0,
          conversions: l.conversions || 0,
          revenue: l.revenue || 0,
          results: l.conversions || 0,
        }));

        // ─── Aggregate + Calculate semua 25+ derived metrics ───
        const aggregatedBase = aggregateBaseMetrics(baseLogs);
        const calculatedMetrics = calculateAllMetrics(aggregatedBase);

        // Round all values to reasonable precision
        const roundedMetrics: Record<string, number | null> = {};
        for (const [key, value] of Object.entries(calculatedMetrics)) {
          if (value === null || value === undefined) {
            roundedMetrics[key] = null;
          } else {
            // Currency & percentages → 2 decimal, counts → integer
            const isCurrency = ["amount_spent", "purchase_value", "aov", "add_to_cart_value"].includes(key);
            const isCost = key.startsWith("cost_") || ["cpm", "cpc_all", "cpc_link", "cpv", "cpi", "vcpm"].includes(key);
            const isPercent = key.includes("ctr") || key.includes("ratio") || key.includes("rate") || key === "vtr" || key === "engagement_rate" || key === "impression_share";
            const isRatio = key === "purchase_roas" || key === "frequency" || key === "quality_score";

            if (isCurrency || isCost) {
              roundedMetrics[key] = Math.round(value);
            } else if (isPercent || isRatio) {
              roundedMetrics[key] = parseFloat(value.toFixed(2));
            } else {
              roundedMetrics[key] = Math.round(value);
            }
          }
        }

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
        const actualSpend = roundedMetrics.amount_spent || 0;
        const pacingPercent =
          targetWeeklySpend > 0
            ? parseFloat(((actualSpend / targetWeeklySpend) * 100).toFixed(1))
            : 0;

        const budgetPacing = {
          targetSpend: targetWeeklySpend,
          actualSpend,
          pacingPercent,
          remainingBudget: Math.max(0, targetWeeklySpend - actualSpend),
          activeAccountCount: activeAccounts.length,
          periodDays,
        };

        // ─── Aggregate per platform (dengan full metrics) ───
        const platformAgg: Record<
          string,
          { logs: typeof baseLogs; accountIds: Set<string> }
        > = {};

        logs.forEach((log, idx) => {
          const account = accountMap.get(log.ad_account_id);
          if (!account) return;
          const platform = account.platform || "Unknown";

          if (!platformAgg[platform]) {
            platformAgg[platform] = { logs: [], accountIds: new Set() };
          }

          platformAgg[platform].logs.push(baseLogs[idx]);
          platformAgg[platform].accountIds.add(log.ad_account_id);
        });

        const platformBreakdown = Object.entries(platformAgg).map(([platform, data]) => {
          const platBase = aggregateBaseMetrics(data.logs);
          const platCalc = calculateAllMetrics(platBase);
          return {
            platform,
            accountCount: data.accountIds.size,
            spend: Math.round(platCalc.amount_spent || 0),
            impressions: platCalc.impressions || 0,
            clicks: platCalc.clicks_all || 0,
            conversions: platCalc.results || 0,
            revenue: Math.round(platCalc.purchase_value || 0),
            ctr: platCalc.ctr_all || 0,
            cpr: Math.round(platCalc.cost_per_result || 0),
            roas: platCalc.purchase_roas || 0,
            // Extended metrics per platform
            cpm: Math.round(platCalc.cpm || 0),
            cpc: Math.round(platCalc.cpc_all || 0),
            frequency: platCalc.frequency || 0,
            reach: platCalc.reach || 0,
            link_clicks: platCalc.link_clicks || 0,
            messaging_conversations_started: platCalc.messaging_conversations_started || 0,
            purchases: platCalc.purchases || 0,
          };
        });

        // ─── Filter visible metrics berdasarkan objective ───
        const objectiveConfig = OBJECTIVE_MAP[dominantObjective];
        const visibleMetricKeys: MetricKey[] = objectiveConfig
          ? [...objectiveConfig.primaryMetrics, ...objectiveConfig.secondaryMetrics]
          : Object.keys(roundedMetrics) as MetricKey[];

        const filteredMetrics: Record<string, number | null> = {};
        visibleMetricKeys.forEach((key) => {
          if (key in roundedMetrics) {
            filteredMetrics[key] = roundedMetrics[key];
          }
        });

        return NextResponse.json({
          success: true,
          hasData: true,
          accountCount: accounts.length,
          logCount: logs.length,
          objective: dominantObjective,
          metrics: filteredMetrics,
          allMetrics: roundedMetrics, // Full metrics untuk advanced view
          primaryMetrics: objectiveConfig?.primaryMetrics || [],
          funnelMetrics: objectiveConfig?.funnelMetrics || null,
          hiddenMetrics: objectiveConfig?.hiddenMetrics || [],
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

        // Ambil report source + metrics-nya
        const [srcRepRes, srcMetricsRes] = await Promise.all([
          supabase.from("weekly_reports").select("*").eq("id", reportId).single(),
          supabase.from("report_metrics").select("*").eq("weekly_report_id", reportId),
        ]);

        const sourceReport = srcRepRes.data;
        const sourceMetrics = srcMetricsRes.data || [];

        if (srcRepRes.error) throw srcRepRes.error;
        if (!sourceReport) {
          return NextResponse.json({ error: "Report source tidak ditemukan" }, { status: 404 });
        }

        // Insert report baru - copy summary/notes sebagai template
        const { data: newReport, error: insertErr } = await supabase
          .from("weekly_reports")
          .insert({
            client_id: sourceReport.client_id,
            pic_id: userId || sourceReport.pic_id,
            period_start: newPeriodStart,
            period_end: newPeriodEnd,
            summary: sourceReport.summary || "",
            performance_text: sourceReport.performance_text || "",
            conclusion: sourceReport.conclusion || "",
            action: sourceReport.action || "",
            status: "draft",
            objective: (sourceReport as { objective?: string }).objective || "SALES",
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        // Copy metrics dari source sebagai template (value/previous_value = null, perlu re-pull)
        let copiedMetricsCount = 0;
        if (sourceMetrics.length > 0) {
          const metricsPayload = sourceMetrics.map((m) => ({
            weekly_report_id: newReport.id,
            metric_type: m.metric_type,
            value: null, // Reset - perlu pull-ads untuk isi otomatis
            previous_value: null,
            platform: m.platform,
            objective: (m as { objective?: string }).objective || null,
          }));

          const { error: metricsInsertErr, count } = await supabase
            .from("report_metrics")
            .insert(metricsPayload);

          if (metricsInsertErr) {
            console.warn("[clone] Failed to copy metrics:", metricsInsertErr.message);
          } else {
            copiedMetricsCount = count || sourceMetrics.length;
          }
        }

        return NextResponse.json({
          success: true,
          newReportId: newReport.id,
          copiedMetricsCount,
          message: copiedMetricsCount > 0
            ? `Report di-clone dengan ${copiedMetricsCount} baris metrik (sebagai template). Jalankan "Pull Ads" untuk mengisi value periode baru.`
            : "Report di-clone. Jalankan 'Pull Ads' untuk mengisi metrik periode baru.",
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

      // ─── BULK DELETE: Batch delete multiple reports + metrics (admin only) ───
      case "bulk-delete": {
        const { reportIds } = body as { reportIds: string[] };

        if (!Array.isArray(reportIds) || reportIds.length === 0) {
          return NextResponse.json(
            { error: "reportIds[] wajib diisi (array)" },
            { status: 400 }
          );
        }

        // Cap untuk hindari abuse (max 100 report sekali delete)
        if (reportIds.length > 100) {
          return NextResponse.json(
            { error: "Maksimal 100 report per batch" },
            { status: 400 }
          );
        }

        // Hapus metrics dulu (foreign key constraint) — pakai .in() untuk batch
        const { error: delMetricsErr } = await supabase
          .from("report_metrics")
          .delete()
          .in("weekly_report_id", reportIds);

        if (delMetricsErr) throw delMetricsErr;

        // Hapus shared_reports yang related
        const { error: delSharesErr } = await supabase
          .from("shared_reports")
          .delete()
          .in("report_id", reportIds);

        if (delSharesErr) {
          console.warn("[bulk-delete] shared_reports cleanup failed:", delSharesErr.message);
          // tidak fatal — lanjut
        }

        // Lalu hapus reports
        const { error: delReportsErr, count } = await supabase
          .from("weekly_reports")
          .delete()
          .in("id", reportIds);

        if (delReportsErr) throw delReportsErr;

        return NextResponse.json({
          success: true,
          deleted: reportIds.length,
          count: count || reportIds.length,
        });
      }

      // ─── BULK UPDATE STATUS: Batch update status (draft/submitted/reviewed) ───
      case "bulk-update-status": {
        const { reportIds, status } = body as {
          reportIds: string[];
          status: string;
        };

        if (!Array.isArray(reportIds) || reportIds.length === 0) {
          return NextResponse.json(
            { error: "reportIds[] wajib diisi (array)" },
            { status: 400 }
          );
        }

        const VALID_STATUSES = ["draft", "submitted", "reviewed"];
        if (!VALID_STATUSES.includes(status)) {
          return NextResponse.json(
            { error: `Status tidak valid. Pilihan: ${VALID_STATUSES.join(", ")}` },
            { status: 400 }
          );
        }

        if (reportIds.length > 100) {
          return NextResponse.json(
            { error: "Maksimal 100 report per batch" },
            { status: 400 }
          );
        }

        const { error: updateErr, count } = await supabase
          .from("weekly_reports")
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .in("id", reportIds);

        if (updateErr) throw updateErr;

        return NextResponse.json({
          success: true,
          updated: reportIds.length,
          count: count || reportIds.length,
          status,
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