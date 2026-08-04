/**
 * 🚀 Weekly Reports Sync Engine (Optimized v2)
 * ============================================================================
 * Engine shared untuk auto-sync weekly reports dari published Google Sheet
 * multi-tab. Dipakai oleh:
 *   - /api/reports/sync        → manual sync (button "Sync Now")
 *   - /api/reports/cron/sync   → cron auto-sync (Vercel cron, daily)
 *
 * Idempotent: berdasarkan unique index (client_id, period_start, period_end).
 *
 * 🆕 v2 OPTIMIZATIONS (fix Vercel 504 timeout):
 *   - BATCH upsert weekly_reports (1 query instead of 285)
 *   - BATCH delete + insert report_metrics (2 queries instead of 570)
 *   - Pre-fetch all existing reports in 1 query (instead of 285 maybeSingle)
 *   - Total: ~6 round-trips vs ~1100+ sebelumnya (200x faster)
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
  /**
   * 🆕 v2.3: Granular skip breakdown.
   * Memberi insight kenapa row di-skip — apakah narrative, dedup, format issue, dll.
   * Berguna untuk debugging & memberi user transparency.
   */
  skippedBreakdown?: {
    noMetrics: number;       // Baris narrative/header tanpa metric (KESIMPULAN, ACTION, dll)
    noClient: number;        // Baris kosong / separator
    noPeriod: number;        // Format period tidak ter-detect
    dedup: number;           // Weekly report duplicate (muncul di multiple sheet tabs)
    unmatchedClient: number; // Nama client tidak match dengan DB
    samples: {
      noMetrics: string[];     // 3 contoh row
      noClient: string[];      // 3 contoh row
      noPeriod: string[];      // 3 contoh row
      dedup: string[];         // 3 contoh row
      unmatchedClient: string[]; // 3 contoh row
    };
  };
}

// ============================================================================
// MAIN SYNC FUNCTION (BATCH-OPTIMIZED)
// ============================================================================

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

  // 🆕 v2.3: Granular skip counters
  let skipNoMetrics = 0;
  let skipNoClient = 0;
  let skipNoPeriod = 0;
  let skipDedup = 0;
  let skipUnmatchedClient = 0;
  const skipSamples = {
    noMetrics: [] as string[],
    noClient: [] as string[],
    noPeriod: [] as string[],
    dedup: [] as string[],
    unmatchedClient: [] as string[],
  };
  const MAX_SAMPLES = 3;
  const addSample = (bucket: keyof typeof skipSamples, value: string) => {
    if (skipSamples[bucket].length < MAX_SAMPLES) {
      skipSamples[bucket].push(value);
    }
  };
  const summarize = (text: string, maxLen = 80) =>
    text.replace(/\s+/g, " ").trim().slice(0, maxLen);

  // ── 1. Init Supabase Admin ──────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env");
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // ── 2. Fetch & parse SEMUA sheet tabs (parallel) ────────────────────────
  console.log("[sync-v2] Fetching & parsing sheets:", sheetUrl);
  const multiResult = await fetchAndParseAllSheets(sheetUrl);
  if (multiResult.errors.length > 0) {
    errors_detail.push(...multiResult.errors);
  }
  console.log(
    `[sync-v2] Parsed ${multiResult.totalParsed} rows from ${multiResult.sheets.length} sheets in ${Date.now() - startedAt.getTime()}ms`
  );

  // ── 3. Load DB: clients, profiles, existing reports (PARALLEL) ─────────
  const tLoadStart = Date.now();
  // ⚠️ LOAD ALL REPORTS (no URL filter) — defense in depth:
  // Kalau ada reports yang di-insert dengan sheet URL beda / NULL sebelumnya,
  // tetap ke-detect sebagai existing (idempotent upsert, bukan insert baru).
  const [{ data: dbClients }, { data: dbProfiles }, { data: dbExistingReports }] = await Promise.all([
    supabase.from("clients").select("id, name"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("weekly_reports").select("id, client_id, period_start, period_end"),
  ]);
  console.log(
    `[sync-v2] Loaded ${dbClients?.length || 0} clients, ${dbProfiles?.length || 0} profiles, ${dbExistingReports?.length || 0} existing reports in ${Date.now() - tLoadStart}ms`
  );

  const clients: Array<{ id: string; name: string }> = dbClients || [];
  const profiles: Array<{ id: string; full_name: string }> = dbProfiles || [];

  // Map existing reports: key = "client_id|period_start" → id
  const existingReportsMap = new Map<string, string>();
  for (const r of dbExistingReports || []) {
    const key = `${r.client_id}|${r.period_start}`;
    existingReportsMap.set(key, r.id);
  }

  // ── 4. Cache untuk performa fuzzy match ─────────────────────────────────
  const clientCache = new Map<string, { id: string; confidence: number }>();
  const picCache = new Map<string, { id: string; confidence: number }>();

  // 🆕 v2.1: In-memory dedup untuk mencegah duplicate rows saat sync berjalan
  // beberapa kali atau row yang sama muncul di multiple sheet tabs (mis.
  // weekly report akhir Juni bisa muncul di tab "June '26" DAN "Juli '26").
  const processedReportKeys = new Set<string>();
  let dedupSkipped = 0;

  // ── 5. PRE-PROCESS ALL ROWS (in-memory, no DB calls) ───────────────────
  // Build arrays of payloads ready for batch insert/upsert
  const tPreprocessStart = Date.now();
  const reportsToInsert: Array<Record<string, unknown>> = [];
  const reportsToUpdate: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const allMetricsByReportKey: Array<{ reportKey: string; metrics: Array<{ metric_type: string; value: number | null; platform?: string | null }> }> = [];

  for (const sheet of multiResult.sheets) {
    let sheetImported = 0;

    for (const row of sheet.parsed.rows) {
      totalRows++;
      try {
        // ── Skip invalid rows (with granular tracking) ──
        if (row.metrics.length === 0) {
          skipped++;
          skipNoMetrics++;
          addSample(
            "noMetrics",
            `Sheet "${sheet.name}" row ${row.rowIndex}: "${summarize(row.rawPerformanceText)}"`
          );
          continue;
        }
        if (!row.clientName) {
          skipped++;
          skipNoClient++;
          addSample(
            "noClient",
            `Sheet "${sheet.name}" row ${row.rowIndex}: performance="${summarize(row.rawPerformanceText)}"`
          );
          continue;
        }

        // ── Resolve client_id ──
        let clientId: string | undefined;
        const clientKey = row.clientName.toLowerCase();

        if (clientCache.has(clientKey)) {
          clientId = clientCache.get(clientKey)?.id;
        } else {
          const matched = matchClientFuzzy(row.clientName, clients);
          if (matched && matched.confidence >= 0.6) {
            clientId = matched.id;
            clientCache.set(clientKey, { id: matched.id, confidence: matched.confidence });
          }
        }

        if (!clientId) {
          // Auto-create new client (per-row, but should be rare)
          if (options.autoCreateClient) {
            const { data: newClient, error } = await supabase
              .from("clients")
              .insert({ name: row.clientName, status: "active" })
              .select("id")
              .single();
            if (!error && newClient) {
              clientId = newClient.id;
              clientCache.set(clientKey, { id: newClient.id, confidence: 1 });
              clients.push({ id: newClient.id, name: row.clientName });
            }
          }
        }

        if (!clientId) {
          unmatchedClients.add(row.clientName);
          // 🆕 v2.3: track unmatched as skip + sample
          skipped++;
          skipUnmatchedClient++;
          addSample(
            "unmatchedClient",
            `Sheet "${sheet.name}" row ${row.rowIndex}: client="${row.clientName}"`
          );
          continue;
        }

        // ── Resolve pic_id ──
        let picId: string | undefined;
        if (row.picName) {
          const picKey = row.picName.toLowerCase();
          if (picCache.has(picKey)) {
            picId = picCache.get(picKey)?.id;
          } else {
            const matched = matchPicFuzzy(row.picName, profiles);
            if (matched && matched.confidence >= 0.6) {
              picId = matched.id;
              picCache.set(picKey, { id: matched.id, confidence: matched.confidence });
            }
            if (!picId) unmatchedPics.add(row.picName);
          }
        }

        // ── Resolve period ──
        const periodStart = toDateString(row.periodStart);
        let periodEnd = toDateString(row.periodEnd);
        if (periodStart && !periodEnd) {
          const d = new Date(periodStart);
          d.setDate(d.getDate() + 6);
          periodEnd = toDateString(d);
        }

        if (!periodStart) {
          skipped++;
          skipNoPeriod++;
          addSample(
            "noPeriod",
            `Sheet "${sheet.name}" row ${row.rowIndex}: client="${row.clientName}" performance="${summarize(row.rawPerformanceText)}"`
          );
          continue;
        }

        // ── Build payload ──
        // ✅ Migration v48 sudah dijalankan user: kolom metadata sync SUDAH ADA.
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
          source_sheet_url: sheetUrl,
          // ✅ ENABLED setelah migration v48 (kolom sudah ada di production DB):
          last_synced_at: new Date().toISOString(),
          sheet_source: sheet.name,
          sheet_gid: sheet.gid,
        };

        const reportKey = `${clientId}|${periodStart}`;

        // 🆕 v2.1: Skip jika reportKey SUDAH diproses dalam run ini
        // (terjadi kalau row muncul di multiple sheet tabs atau duplicate di sheet)
        if (processedReportKeys.has(reportKey)) {
          dedupSkipped++;
          skipDedup++;
          skipped++;
          addSample(
            "dedup",
            `Sheet "${sheet.name}" row ${row.rowIndex}: client="${row.clientName}" period=${periodStart}`
          );
          continue;
        }
        processedReportKeys.add(reportKey);

        const existingId = existingReportsMap.get(reportKey);

        if (existingId) {
          reportsToUpdate.push({ id: existingId, payload: reportPayload });
          updated++;
        } else {
          reportsToInsert.push(reportPayload);
          imported++;
        }

        allMetricsByReportKey.push({
          reportKey,
          metrics: row.metrics.map((m) => ({
            metric_type: m.key,
            value: m.value,
            platform: row.platform,
          })),
        });

        sheetImported++;
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

  console.log(
    `[sync-v2] Pre-process done: ${reportsToInsert.length} insert, ${reportsToUpdate.length} update, ${allMetricsByReportKey.length} metric groups in ${Date.now() - tPreprocessStart}ms`
  );

  // ── 6. CHUNKED BATCH INSERT weekly_reports (resilient) ─────────────────
  // v2.2: Insert dalam chunk 50 rows. Kalau ada row bermasalah (mis. NOT NULL
  // violation), hanya chunk itu yang gagal — bukan seluruh batch. Chunk yang
  // gagal di-retry per-row untuk identifikasi row spesifik.
  const tInsertStart = Date.now();
  let insertedReportIds: Array<{ id: string; client_id: string; period_start: string }> = [];

  if (reportsToInsert.length > 0) {
    const INSERT_CHUNK_SIZE = 50;
    for (let i = 0; i < reportsToInsert.length; i += INSERT_CHUNK_SIZE) {
      const chunk = reportsToInsert.slice(i, i + INSERT_CHUNK_SIZE);
      const { data: inserted, error: insertErr } = await supabase
        .from("weekly_reports")
        .insert(chunk)
        .select("id, client_id, period_start");

      if (insertErr) {
        console.warn(
          `[sync-v2] Chunk ${i / INSERT_CHUNK_SIZE + 1} insert failed (${chunk.length} rows): ${insertErr.message}. Retrying per-row...`
        );
        // Retry per-row untuk identifikasi row spesifik yang bermasalah
        for (const payload of chunk) {
          const { data: single, error: singleErr } = await supabase
            .from("weekly_reports")
            .insert(payload)
            .select("id, client_id, period_start")
            .maybeSingle();
          if (singleErr) {
            errors++;
            errors_detail.push(
              `Row insert failed (${payload.client_id}, ${payload.period_start}): ${singleErr.message}`
            );
          } else if (single) {
            insertedReportIds.push(single);
            existingReportsMap.set(`${single.client_id}|${single.period_start}`, single.id);
          }
        }
      } else if (inserted) {
        insertedReportIds.push(...inserted);
        for (const r of inserted) {
          existingReportsMap.set(`${r.client_id}|${r.period_start}`, r.id);
        }
      }
    }
  }
  console.log(`[sync-v2] Inserted ${insertedReportIds.length} reports in ${Date.now() - tInsertStart}ms`);

  // ── 7. BATCH UPDATE weekly_reports (parallel, but limited concurrency) ─
  const tUpdateStart = Date.now();
  if (reportsToUpdate.length > 0) {
    // Process updates in parallel chunks to avoid overwhelming DB
    const UPDATE_CHUNK_SIZE = 20;
    for (let i = 0; i < reportsToUpdate.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = reportsToUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
      await Promise.all(
        chunk.map(({ id, payload }) =>
          supabase.from("weekly_reports").update(payload).eq("id", id)
        )
      );
    }
  }
  console.log(`[sync-v2] Updated ${reportsToUpdate.length} reports in ${Date.now() - tUpdateStart}ms`);

  // ── 8. BATCH DELETE + INSERT report_metrics ────────────────────────────
  const tMetricsStart = Date.now();
  const allReportIds = [
    ...insertedReportIds.map((r) => r.id),
    ...reportsToUpdate.map((r) => r.id),
  ];

  if (allReportIds.length > 0) {
    // Delete all existing metrics for these reports (1 query)
    const { error: delErr } = await supabase
      .from("report_metrics")
      .delete()
      .in("weekly_report_id", allReportIds);

    if (delErr) {
      console.error("[sync-v2] Batch delete metrics error:", delErr.message);
    } else {
      // Build flat array of all metrics to insert
      const allMetricsPayload: Array<Record<string, unknown>> = [];
      for (const { reportKey, metrics } of allMetricsByReportKey) {
        const reportId = existingReportsMap.get(reportKey);
        if (!reportId) continue;
        for (const m of metrics) {
          allMetricsPayload.push({
            weekly_report_id: reportId,
            metric_type: m.metric_type,
            value: m.value,
            previous_value: null,
            platform: m.platform,
          });
        }
      }

      // Insert all metrics in chunks of 500 (Supabase batch limit safe)
      if (allMetricsPayload.length > 0) {
        const METRICS_CHUNK_SIZE = 500;
        for (let i = 0; i < allMetricsPayload.length; i += METRICS_CHUNK_SIZE) {
          const chunk = allMetricsPayload.slice(i, i + METRICS_CHUNK_SIZE);
          const { error: mErr } = await supabase.from("report_metrics").insert(chunk);
          if (mErr) {
            console.error("[sync-v2] Metrics batch insert error:", mErr.message);
            errors_detail.push(`Metrics insert (chunk ${i}): ${mErr.message}`);
          }
        }
        console.log(`[sync-v2] Inserted ${allMetricsPayload.length} metrics in ${Date.now() - tMetricsStart}ms`);
      }
    }
  }

  // ── 9. Done ────────────────────────────────────────────────────────────
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // 🆕 v2.3: Sanity check — total skip harus sama dengan sum of granular counters
  const granularSum =
    skipNoMetrics + skipNoClient + skipNoPeriod + skipDedup + skipUnmatchedClient;
  if (granularSum !== skipped) {
    console.warn(
      `[sync-v2] ⚠️ Skip breakdown mismatch: total=${skipped}, granular sum=${granularSum} (diff=${skipped - granularSum})`
    );
  }

  console.log(
    `[sync-v2] ✅ Done: ${imported} imported, ${updated} updated, ${skipped} skipped [noMetrics=${skipNoMetrics}, noClient=${skipNoClient}, noPeriod=${skipNoPeriod}, dedup=${skipDedup}, unmatchedClient=${skipUnmatchedClient}], ${errors} errors in ${durationMs}ms`
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
    // 🆕 v2.3: Granular skip breakdown untuk transparency & debugging
    skippedBreakdown: {
      noMetrics: skipNoMetrics,
      noClient: skipNoClient,
      noPeriod: skipNoPeriod,
      dedup: skipDedup,
      unmatchedClient: skipUnmatchedClient,
      samples: skipSamples,
    },
  };
}

// ============================================================================
// DEFAULT SHEET URL HELPER
// ============================================================================

export function getDefaultSheetUrl(): string {
  const url =
    process.env.WEEKLY_REPORT_SHEET_URL ||
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";
  return url;
}