/**
 * 🔌 API: Import Weekly Report dari Google Sheet
 * ============================================================================
 * Endpoint:
 *   POST /api/reports/import-sheet
 *     body: { action: "preview", sheetUrl: string }
 *       → returns: parsed rows dengan match status
 *     body: { action: "import", rows: [...] , options: { autoCreateClient, skipExisting } }
 *       → returns: import result
 *
 * Auth: wajib login (pakai anon key + RLS, pattern sama dengan /api/reports)
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/auth-api";
import {
  fetchSheetCSV,
  parseAllRows,
  matchClientFuzzy,
  matchPicFuzzy,
  toDateString,
  type ParsedRow,
} from "@/lib/sheet-parser";

// ============================================================================
// TYPES
// ============================================================================

interface PreviewRow {
  rowIndex: number;
  date: string | null;
  clientName: string;
  picName: string;
  division: string;
  platform: string;
  detectedObjective: string;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: Array<{ key: string; rawLabel: string; value: number; unit: string }>;
  analysisText: string;
  status: string;
  rawPerformanceText: string;
  // Match info
  matchedClient: { id: string; name: string; confidence: number } | null;
  matchedPic: { id: string; full_name: string; confidence: number } | null;
  // Status flag
  matchStatus: "matched" | "no-match" | "exists" | "no-metric";
  existingReportId?: string;
  parseWarnings: string[];
}

interface ImportRowPayload {
  rowIndex: number;
  clientName: string;
  picName: string;
  division: string;
  platform: string;
  detectedObjective: string;
  date?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  metrics: Array<{ key: string; rawLabel: string; value: number; unit: string }>;
  analysisText: string;
  status: string;
  rawPerformanceText?: string;
  // Override match (dari frontend kalau user pilih manual)
  matchedClientId?: string;
  matchedPicId?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 requests/min per IP — preview/import operation berat
    // (CSV fetch + DB writes)
    const rateLimited = applyRateLimit(req, "reports-import-sheet", 5);
    if (rateLimited) return rateLimited;

    const { supabase, user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "preview") {
      return await handlePreview(supabase, body.sheetUrl as string);
    }

    if (action === "import") {
      return await handleImport(
        supabase,
        user.id,
        body.rows as ImportRowPayload[],
        body.options || {}
      );
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("[import-sheet] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ============================================================================
// PREVIEW
// ============================================================================

async function handlePreview(supabase: ReturnType<typeof createClient>, sheetUrl: string) {
  if (!sheetUrl || !sheetUrl.includes("docs.google.com/spreadsheets")) {
    return NextResponse.json(
      { error: "URL sheet tidak valid. Pastikan URL dari Google Spreadsheet." },
      { status: 400 }
    );
  }

  // 1. Fetch & parse CSV
  const rawRows = await fetchSheetCSV(sheetUrl);
  const parseResult = parseAllRows(rawRows);

  if (parseResult.rows.length === 0) {
    return NextResponse.json(
      { error: "Sheet berhasil dibaca tapi tidak ada baris data. Pastikan sheet sudah di-publish." },
      { status: 422 }
    );
  }

  // 2. Load DB: clients & profiles
  const [{ data: dbClients }, { data: dbProfiles }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const clients = (dbClients as Array<{ id: string; name: string }>) || [];
  const profiles = (dbProfiles as Array<{ id: string; full_name: string }>) || [];

  // 3. Load existing weekly_reports untuk check idempotent
  const { data: existingReports } = await supabase
    .from("weekly_reports")
    .select("id, client_id, period_start, period_end, objective");

  const existing = (existingReports as Array<{
    id: string;
    client_id: string;
    period_start: string;
    period_end: string;
    objective: string | null;
  }>) || [];

  // 4. Map parsed rows ke PreviewRow + match status
  const previewRows: PreviewRow[] = parseResult.rows.map((row: ParsedRow) => {
    const matchedClient = matchClientFuzzy(row.clientName, clients);
    const matchedPic = matchPicFuzzy(row.picName, profiles);

    let matchStatus: PreviewRow["matchStatus"] = "no-match";
    let existingReportId: string | undefined;

    // Check existing
    if (matchedClient && row.periodStart) {
      const periodStr = toDateString(row.periodStart);
      if (periodStr) {
        const found = existing.find(
          (e) => e.client_id === matchedClient.id && e.period_start === periodStr
        );
        if (found) {
          matchStatus = "exists";
          existingReportId = found.id;
        }
      }
    }

    if (matchStatus === "no-match" && matchedClient && row.metrics.length > 0) {
      matchStatus = "matched";
    } else if (matchStatus === "no-match" && row.metrics.length === 0) {
      matchStatus = "no-metric";
    }

    return {
      rowIndex: row.rowIndex,
      date: toDateString(row.date),
      clientName: row.clientName,
      picName: row.picName,
      division: row.division,
      platform: row.platform,
      detectedObjective: row.detectedObjective,
      periodStart: toDateString(row.periodStart),
      periodEnd: toDateString(row.periodEnd),
      metrics: row.metrics.map((m) => ({
        key: m.key,
        rawLabel: m.rawLabel,
        value: m.value,
        unit: m.unit,
      })),
      analysisText: row.analysisText,
      status: row.status,
      rawPerformanceText: row.rawPerformanceText,
      matchedClient: matchedClient && matchedClient.confidence >= 0.5 ? matchedClient : null,
      matchedPic: matchedPic && matchedPic.confidence >= 0.5 ? matchedPic : null,
      matchStatus,
      existingReportId,
      parseWarnings: row.parseWarnings,
    };
  });

  // 5. Stats
  const stats = {
    total: previewRows.length,
    matched: previewRows.filter((r) => r.matchStatus === "matched").length,
    noMatch: previewRows.filter((r) => r.matchStatus === "no-match").length,
    exists: previewRows.filter((r) => r.matchStatus === "exists").length,
    noMetric: previewRows.filter((r) => r.matchStatus === "no-metric").length,
  };

  return NextResponse.json({
    success: true,
    rows: previewRows,
    stats,
    parseErrors: parseResult.errors,
    skippedHeader: parseResult.skippedHeader,
  });
}

// ============================================================================
// IMPORT
// ============================================================================

interface ImportOptions {
  autoCreateClient?: boolean;
  skipExisting?: boolean;
}

async function handleImport(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  rows: ImportRowPayload[],
  options: ImportOptions
) {
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Tidak ada row untuk diimport" }, { status: 400 });
  }

  // Cache untuk performa (hindari re-fetch)
  const clientCache = new Map<string, string>(); // name → id
  const picCache = new Map<string, string>();

  const results: Array<{
    rowIndex: number;
    status: "imported" | "skipped" | "error";
    reportId?: string;
    clientId?: string;
    error?: string;
    // 🆕 v2.3 (Sprint 4.6 P1): tambahan untuk skip breakdown di frontend
    clientName?: string;
    skipReason?: string;
  }> = [];

  for (const row of rows) {
    try {
      // 1. Resolve client_id
      let clientId = row.matchedClientId;

      if (!clientId && row.clientName) {
        const cacheKey = row.clientName.toLowerCase();
        if (clientCache.has(cacheKey)) {
          clientId = clientCache.get(cacheKey);
        } else {
          // Cari di DB
          const { data: found } = await supabase
            .from("clients")
            .select("id")
            .ilike("name", row.clientName)
            .limit(1)
            .maybeSingle();
          const foundClient = found as { id: string } | null;
          if (foundClient?.id) {
            clientId = foundClient.id;
            clientCache.set(cacheKey, foundClient.id);
          }
        }
      }

      if (!clientId && options.autoCreateClient && row.clientName) {
        // Auto-create client baru
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            name: row.clientName,
            status: "active",
          } as never)
          .select("id")
          .single();

        if (clientErr || !newClient) {
          results.push({
            rowIndex: row.rowIndex,
            status: "error",
            error: `Gagal create client "${row.clientName}": ${clientErr?.message || "unknown"}`,
          });
          continue;
        }
        clientId = (newClient as { id: string }).id;
        clientCache.set(row.clientName.toLowerCase(), clientId);
      }

      // 🆕 v2.3: ubah ke "skipped" — bukan system error, tapi row tidak bisa diproses
      // karena client tidak dikenali di DB. Lebih akurat secara semantik.
      if (!clientId) {
        results.push({
          rowIndex: row.rowIndex,
          status: "skipped",
          clientName: row.clientName,
          skipReason: `Client tidak dikenali: ${row.clientName}`,
        });
        continue;
      }

      // 2. Resolve pic_id
      let picId = row.matchedPicId;
      if (!picId && row.picName) {
        const cacheKey = row.picName.toLowerCase();
        if (picCache.has(cacheKey)) {
          picId = picCache.get(cacheKey);
        } else {
          const { data: found } = await supabase
            .from("profiles")
            .select("id")
            .ilike("full_name", `%${row.picName}%`)
            .limit(1)
            .maybeSingle();
          const foundPic = found as { id: string } | null;
          if (foundPic?.id) {
            picId = foundPic.id;
            picCache.set(cacheKey, foundPic.id);
          }
        }
      }
      // Fallback ke current user kalau PIC tidak ditemukan
      if (!picId) picId = userId;

      // 3. Resolve period
      const periodStart = row.periodStart || row.date || null;
      // Default period_end = period_start + 6 hari kalau tidak ada
      let periodEnd = row.periodEnd;
      if (periodStart && !periodEnd) {
        const d = new Date(periodStart);
        d.setDate(d.getDate() + 6);
        periodEnd = toDateString(d);
      }

      // 🆕 v2.3: ubah ke "skipped" — bukan system error, tapi format tanggal
      // di sheet tidak dikenali parser.
      if (!periodStart) {
        results.push({
          rowIndex: row.rowIndex,
          status: "skipped",
          clientName: row.clientName,
          skipReason: "Period tidak terdetect (format tanggal tidak dikenali)",
        });
        continue;
      }

      // 4. Check idempotent (skip existing)
      if (options.skipExisting !== false) {
        const { data: existing } = await supabase
          .from("weekly_reports")
          .select("id")
          .eq("client_id", clientId)
          .eq("period_start", periodStart)
          .maybeSingle();

        if (existing) {
          results.push({
            rowIndex: row.rowIndex,
            status: "skipped",
            reportId: (existing as { id: string }).id,
            clientId,
            clientName: row.clientName,
            skipReason: "Duplicate (client + period sudah ada di DB)",
          });
          continue;
        }
      }

      // 5. Insert weekly_report
      const objective = row.detectedObjective || "META_CTWA";
      const status = ["draft", "submitted", "reviewed"].includes(row.status)
        ? row.status
        : "submitted";

      // 🆕 P4: Compute data_status based on metric completeness
      //   - 'ok'           → 3+ metrics (complete)
      //   - 'partial'      → 1-2 metrics (incomplete)
      //   - 'no_metrics'   → 0 metrics (narrative only)
      const metricCount = row.metrics?.length || 0;
      const dataStatus =
        metricCount === 0 ? "no_metrics" : metricCount < 3 ? "partial" : "ok";

      const { data: newReport, error: reportErr } = await supabase
        .from("weekly_reports")
        .insert({
          client_id: clientId,
          pic_id: picId,
          period_start: periodStart,
          period_end: periodEnd,
          performance_text: row.rawPerformanceText?.slice(0, 5000) || null,
          conclusion: row.analysisText?.slice(0, 5000) || null,
          status,
          objective,
          platform: row.platform,
          source_sheet_url: null,
          // 🆕 P4: Sheet source & data provenance tracking
          data_source_kind: "sheet_manual",
          data_status: dataStatus,
          last_synced_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();

      if (reportErr || !newReport) {
        results.push({
          rowIndex: row.rowIndex,
          status: "error",
          error: `Gagal insert report: ${reportErr?.message || "unknown"}`,
        });
        continue;
      }

      const reportId = (newReport as { id: string }).id;

      // 6. Insert metrics
      if (row.metrics && row.metrics.length > 0) {
        const metricsPayload = row.metrics.map((m) => ({
          weekly_report_id: reportId,
          metric_type: m.key,
          value: m.value,
          previous_value: null,
          platform: row.platform,
        }));

        const { error: metricsErr } = await supabase
          .from("report_metrics")
          .insert(metricsPayload as never);

        if (metricsErr) {
          // Tidak fatal — report sudah ter-create, metric bisa di-retry
          results.push({
            rowIndex: row.rowIndex,
            status: "imported",
            reportId,
            clientId,
            error: `Report ter-create tapi metric gagal: ${metricsErr.message}`,
          });
          continue;
        }
      }

      results.push({
        rowIndex: row.rowIndex,
        status: "imported",
        reportId,
        clientId,
      });
    } catch (err) {
      results.push({
        rowIndex: row.rowIndex,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Summary
  const summary = {
    total: rows.length,
    imported: results.filter((r) => r.status === "imported").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({
    success: true,
    summary,
    results,
  });
}