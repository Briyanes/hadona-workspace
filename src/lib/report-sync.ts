/**
 * 🔄 Weekly Reports Sync Engine
 * ============================================================================
 * Engine shared untuk auto-sync weekly reports dari published Google Sheet
 * multi-tab. Dipakai oleh:
 *   - /api/reports/sync        → manual sync (button "Sync Now")
 *   - /api/reports/cron/sync   → cron auto-sync (Vercel cron, daily)
 *
 * Idempotent: berdasarkan unique index (client_id, period_start, period_end).
 * Kalau row sudah ada → update metric, tidak duplikasi.
 *
 * Author: Tim Hadona (3 Advertiser + 5 Web Dev + 2 UI/UX)
 * ============================================================================
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAndParseAllSheets,
  matchClientFuzzy,
  matchPicFuzzy,
  toDateString,
  type ParsedRow,
} from "./sheet-parser";

// ============================================================================
// TYPES
// ============================================================================

export interface SyncResult {
  success: boolean;
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  unmatchedClients: string[];
  unmatchedPics: string[];
  sheets: Array<{ name: string; gid: string; raw: number; parsed: number; imported: number }>;
  errors_detail: string[];
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

/**
 * Sinkronisasi penuh dari Google Sheet ke DB.
 *
 * @param sheetUrl URL published Google Spreadsheet (multi-tab).
 * @param options.autoCreateClient Kalau true, client baru otomatis dibuat.
 */
export async function syncReportsFromSheet(
  sheetUrl: string,
  options: { autoCreateClient?: boolean } = {}
): Promise<SyncResult> {
  const startedAt = new Date();
  const errors_detail: string[] = [];
  const unmatchedClients = new Set<string>();
  const unmatchedPics = new Set<string>();
  const sheetsStats: SyncResult["sheets"] = [];

  let totalRows = 0;
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // ── 1. Init Supabase Admin (service role untuk bypass RLS) ──────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
  }

  // Gunakan SupabaseClient type (Database schema optional - service role bypass)
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── 2. Fetch & parse SEMUA sheet tabs (parallel) ─────────────────────────
  console.log("[sync] Fetching & parsing all sheets from:", sheetUrl);
  const multiResult = await fetchAndParseAllSheets(sheetUrl);

  if (multiResult.errors.length > 0) {
    errors_detail.push(...multiResult.errors);
  }

  console.log(
    `[sync] Parsed ${multiResult.totalParsed} rows from ${multiResult.sheets.length} sheets`
  );

  // ── 3. Load DB: clients & profiles (untuk fuzzy match) ───────────────────
  const [{ data: dbClients }, { data: dbProfiles }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const clients: Array<{ id: string; name: string }> = dbClients || [];
  const profiles: Array<{ id: string; full_name: string }> = dbProfiles || [];

  console.log(`[sync] Loaded ${clients.length} clients, ${profiles.length} profiles from DB`);

  // ── 4. Cache untuk performa ──────────────────────────────────────────────
  const clientCache = new Map<string, { id: string; confidence: number }>();
  const picCache = new Map<string, { id: string; confidence: number }>();

  // ── 5. Process per-sheet, per-row ─────────────────────────────────────────
  for (const sheet of multiResult.sheets) {
    let sheetImported = 0;

    for (const row of sheet.parsed.rows) {
      totalRows++;
      try {
        const result = await processRow(supabase, row, {
          sheetName: sheet.name,
          sheetGid: sheet.gid,
          sheetUrl,
          clients,
          profiles,
          clientCache,
          picCache,
          autoCreateClient: options.autoCreateClient ?? false,
        });

        if (result === "imported") imported++;
        else if (result === "updated") updated++;
        else if (result === "skipped") skipped++;

        if (result === "unmatched-client" && row.clientName) {
          unmatchedClients.add(row.clientName);
        }
        if (result === "unmatched-pic" && row.picName) {
          unmatchedPics.add(row.picName);
        }
        if (result === "error") {
          errors++;
        }

        if (result === "imported" || result === "updated") sheetImported++;
      } catch (err) {
        errors++;
        errors_detail.push(
          `Sheet "${sheet.name}" row ${row.rowIndex}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    sheetsStats.push({
      name: sheet.name,
      gid: sheet.gid,
      raw: sheet.rows.length,
      parsed: sheet.parsed.totalRows,
      imported: sheetImported,
    });
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  console.log(
    `[sync] Done: ${imported} imported, ${updated} updated, ${skipped} skipped, ${errors} errors in ${durationMs}ms`
  );

  return {
    success: errors === 0,
    totalRows,
    imported,
    updated,
    skipped,
    errors,
    unmatchedClients: Array.from(unmatchedClients),
    unmatchedPics: Array.from(unmatchedPics),
    sheets: sheetsStats,
    errors_detail,
    startedAt,
    finishedAt,
    durationMs,
  };
}

// ============================================================================
// ROW PROCESSOR
// ============================================================================

type RowResult =
  | "imported"
  | "updated"
  | "skipped"
  | "error"
  | "unmatched-client"
  | "unmatched-pic";

interface ProcessRowContext {
  sheetName: string;
  sheetGid: string;
  sheetUrl: string;
  clients: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; full_name: string }>;
  clientCache: Map<string, { id: string; confidence: number }>;
  picCache: Map<string, { id: string; confidence: number }>;
  autoCreateClient: boolean;
}

async function processRow(
  supabase: SupabaseClient,
  row: ParsedRow,
  ctx: ProcessRowContext
): Promise<RowResult> {
  // ── Skip row tanpa metric (bukan weekly report, mis. section header) ───
  if (row.metrics.length === 0) return "skipped";
  if (!row.clientName) return "skipped";

  // ── 1. Resolve client_id (cache → fuzzy → DB ilike) ────────────────────
  let clientId: string | undefined;
  const clientKey = row.clientName.toLowerCase();

  if (ctx.clientCache.has(clientKey)) {
    clientId = ctx.clientCache.get(clientKey)?.id;
  } else {
    const matched = matchClientFuzzy(row.clientName, ctx.clients);
    if (matched && matched.confidence >= 0.6) {
      clientId = matched.id;
      ctx.clientCache.set(clientKey, { id: matched.id, confidence: matched.confidence });
    }
  }

  if (!clientId) {
    // Auto-create client baru kalau diaktifkan
    if (ctx.autoCreateClient) {
      const { data: newClient, error } = await supabase
        .from("clients")
        .insert({ name: row.clientName, status: "active" })
        .select("id")
        .single();
      if (!error && newClient) {
        clientId = newClient.id;
        ctx.clientCache.set(clientKey, { id: newClient.id, confidence: 1 });
        ctx.clients.push({ id: newClient.id, name: row.clientName });
      }
    }
  }

  if (!clientId) return "unmatched-client";

  // ── 2. Resolve pic_id ───────────────────────────────────────────────────
  let picId: string | undefined;
  if (row.picName) {
    const picKey = row.picName.toLowerCase();
    if (ctx.picCache.has(picKey)) {
      picId = ctx.picCache.get(picKey)?.id;
    } else {
      const matched = matchPicFuzzy(row.picName, ctx.profiles);
      if (matched && matched.confidence >= 0.6) {
        picId = matched.id;
        ctx.picCache.set(picKey, { id: matched.id, confidence: matched.confidence });
      }
    }
  }

  // ── 3. Resolve period ───────────────────────────────────────────────────
  const periodStart = toDateString(row.periodStart);
  let periodEnd = toDateString(row.periodEnd);
  if (periodStart && !periodEnd) {
    const d = new Date(periodStart);
    d.setDate(d.getDate() + 6);
    periodEnd = toDateString(d);
  }

  if (!periodStart) return "skipped";

  // ── 4. Idempotent upsert (check existing) ───────────────────────────────
  const { data: existing } = await supabase
    .from("weekly_reports")
    .select("id")
    .eq("client_id", clientId)
    .eq("period_start", periodStart)
    .maybeSingle();

  const existingId: string | undefined = existing?.id;

  // ── 5. Insert atau update ───────────────────────────────────────────────
  const objective = row.detectedObjective || "META_CTWA";
  const status = ["draft", "submitted", "reviewed"].includes(row.status)
    ? row.status
    : "submitted";

  const reportPayload = {
    client_id: clientId,
    pic_id: picId || null,
    period_start: periodStart,
    period_end: periodEnd,
    performance_text: row.rawPerformanceText?.slice(0, 5000) || null,
    conclusion: row.analysisText?.slice(0, 5000) || null,
    status,
    objective,
    platform: row.platform,
    source_sheet_url: ctx.sheetUrl,
    last_synced_at: new Date().toISOString(),
    sheet_source: ctx.sheetName,
    sheet_gid: ctx.sheetGid,
  };

  if (existingId) {
    // ── Update existing ──
    const { error: updateErr } = await supabase
      .from("weekly_reports")
      .update(reportPayload)
      .eq("id", existingId);

    if (updateErr) {
      console.error("[sync] Update error:", updateErr.message);
      return "error";
    }

    // Hapus metric lama, insert metric baru (replace strategy)
    await supabase.from("report_metrics").delete().eq("weekly_report_id", existingId);

    if (row.metrics.length > 0) {
      const metricsPayload = row.metrics.map((m) => ({
        weekly_report_id: existingId,
        metric_type: m.key,
        value: m.value,
        previous_value: null,
        platform: row.platform,
      }));
      const { error: mErr } = await supabase.from("report_metrics").insert(metricsPayload);
      if (mErr) console.error("[sync] Metric update error:", mErr.message);
    }

    return "updated";
  }

  // ── Insert new ──
  const { data: newReport, error: insertErr } = await supabase
    .from("weekly_reports")
    .insert(reportPayload)
    .select("id")
    .single();

  if (insertErr || !newReport) {
    console.error("[sync] Insert error:", insertErr?.message);
    return "error";
  }

  const newReportId: string = newReport.id;

  // ── 6. Insert metrics ──────────────────────────────────────────────────
  if (row.metrics.length > 0) {
    const metricsPayload = row.metrics.map((m) => ({
      weekly_report_id: newReportId,
      metric_type: m.key,
      value: m.value,
      previous_value: null,
      platform: row.platform,
    }));
    const { error: mErr } = await supabase.from("report_metrics").insert(metricsPayload);
    if (mErr) console.error("[sync] Metric insert error:", mErr.message);
  }

  return "imported";
}

// ============================================================================
// DEFAULT SHEET URL HELPER
// ============================================================================

/**
 * Get default sheet URL dari env (untuk cron auto-sync).
 * Di-set di Vercel env: WEEKLY_REPORT_SHEET_URL
 */
export function getDefaultSheetUrl(): string {
  const url =
    process.env.WEEKLY_REPORT_SHEET_URL ||
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";
  return url;
}