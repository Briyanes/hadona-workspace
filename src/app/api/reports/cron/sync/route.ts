/**
 * ⏰ Cron: Auto-Sync Weekly Reports dari Google Sheet
 * ============================================================================
 * Endpoint: GET/POST /api/reports/cron/sync
 *
 * Trigger:
 *   - Vercel Cron (lihat vercel.json) → daily at 02:00 UTC (09:00 WIB)
 *   - Manual: ketik URL di browser atau curl POST
 *
 * Auth: CRON_SECRET header (Vercel) atau ?key=ADMIN_SECRET (?)
 *
 * Flow:
 *   1. Fetch published Google Sheet (multi-tab: Januari–Juli '26)
 *   2. Parse semua row → 285 weekly reports
 *   3. Upsert ke weekly_reports (idempotent via unique index)
 *   4. Update report_metrics (replace strategy)
 *
 * Idempotent: aman dijalankan berkali-kali.
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { syncReportsFromSheet, getDefaultSheetUrl } from "@/lib/report-sync";
import { createClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60 detik (Vercel Pro) — sync ~285 rows butuh ~10s

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function GET(req: NextRequest) {
  return handleCronSync(req);
}

export async function POST(req: NextRequest) {
  return handleCronSync(req);
}

async function handleCronSync(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[cron/sync] Started at", new Date().toISOString());

  // ── 1. Auth check (strict, fail-closed) ──────────────────────────────────
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  try {
    // ── 2. Run sync ────────────────────────────────────────────────────────
    const sheetUrl = getDefaultSheetUrl();
    console.log("[cron/sync] Sheet URL:", sheetUrl);

    const result = await syncReportsFromSheet(sheetUrl, {
      autoCreateClient: false, // cron tidak auto-create (manual review)
    });

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`[cron/sync] Completed in ${durationSec}s`);

    // ── 3. (Optional) Log ke activity_logs ─────────────────────────────────
    try {
      const supabase = createClient();
      await supabase.from("activity_logs").insert({
        action: "weekly_report.sync.cron",
        entity_type: "weekly_report",
        details: {
          totalRows: result.totalRows,
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          errors: result.errors,
          unmatchedClients: result.unmatchedClients.length,
          durationMs: result.durationMs,
          sheets: result.sheets,
        },
      } as never);
    } catch (logErr) {
      console.warn("[cron/sync] Gagal log activity:", logErr);
    }

    // ── 4. Return result ──────────────────────────────────────────────────
    return NextResponse.json({
      success: result.success,
      message: `Sync selesai: ${result.imported} baru, ${result.updated} update, ${result.skipped} skip, ${result.errors} error`,
      summary: {
        totalRows: result.totalRows,
        imported: result.imported,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        unmatchedClientsCount: result.unmatchedClients.length,
        unmatchedPicsCount: result.unmatchedPics.length,
        durationMs: result.durationMs,
        durationSec: parseFloat(durationSec),
        sheets: result.sheets,
      },
      unmatchedClients: result.unmatchedClients.slice(0, 50),
      unmatchedPics: result.unmatchedPics.slice(0, 20),
      errors_detail: result.errors_detail.slice(0, 20),
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    });
  } catch (err) {
    console.error("[cron/sync] Fatal error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
        durationSec: ((Date.now() - startedAt) / 1000).toFixed(2),
      },
      { status: 500 }
    );
  }
}

