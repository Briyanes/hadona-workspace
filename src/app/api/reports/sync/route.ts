/**
 * 🔘 API: Manual Sync Weekly Reports (Sync Now button)
 * ============================================================================
 * Endpoint: POST /api/reports/sync
 *
 * Body:
 *   { }                                    → sync pakai default URL (env)
 *   { sheetUrl: "https://..." }            → sync pakai URL custom
 *   { autoCreateClient: true }             → auto-create client baru
 *
 * Auth: wajib login (super_admin/project_manager/creative_director — lihat permission check).
 *
 * Returns: SyncResult (sama dengan cron).
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { syncReportsFromSheet, getDefaultSheetUrl } from "@/lib/report-sync";
import { createClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/auth-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();

  // Rate limit: 3 syncs/hour per IP — operasi sangat berat (60s maxDuration)
  const rateLimited = applyRateLimit(req, "reports-sync", 3, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;
  console.log("[reports/sync] Manual sync triggered at", new Date().toISOString());

  try {
    // ── 1. Auth & permission ───────────────────────────────────────────────
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cek role — hanya super_admin/project_manager/creative_director yang boleh trigger sync.
    // (Sesuai enum user_role di supabase/schema.sql & konsisten dengan admin/users/route.ts)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role: string } | null)?.role;
    const allowedSyncRoles = ["super_admin", "project_manager", "creative_director"];
    if (!allowedSyncRoles.includes(role || "")) {
      // Include role in error for debugging (helps users understand why they're blocked)
      const roleDisplay = role || "(kosong/belum diset)";
      return NextResponse.json(
        {
          error: `Forbidden: role Anda "${roleDisplay}" tidak diizinkan sync. Yang diizinkan: ${allowedSyncRoles.join(", ")}`,
          debug: { userRole: role, allowedSyncRoles },
        },
        { status: 403 }
      );
    }

    // ── 2. Parse body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const sheetUrl: string = body.sheetUrl || getDefaultSheetUrl();
    const autoCreateClient: boolean = body.autoCreateClient === true;

    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      return NextResponse.json(
        { error: "URL sheet tidak valid" },
        { status: 400 }
      );
    }

    console.log("[reports/sync] Syncing from:", sheetUrl, "autoCreateClient:", autoCreateClient);

    // ── 3. Run sync ────────────────────────────────────────────────────────
    const result = await syncReportsFromSheet(sheetUrl, { autoCreateClient });

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`[reports/sync] Done in ${durationSec}s`);

    // ── 4. Log activity ────────────────────────────────────────────────────
    try {
      await supabase.from("activity_logs").insert({
        user_id: user.id,
        action: "weekly_report.sync.manual",
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
          triggeredBy: user.id,
        },
      } as never);
    } catch (logErr) {
      console.warn("[reports/sync] Gagal log activity:", logErr);
    }

    // ── 5. Return result ──────────────────────────────────────────────────
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
        // 🆕 v2.2: Forward skipped breakdown ke frontend untuk transparency
        skippedBreakdown: result.skippedBreakdown,
      },
      unmatchedClients: result.unmatchedClients,
      unmatchedPics: result.unmatchedPics,
      errors_detail: result.errors_detail,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    });
  } catch (err) {
    console.error("[reports/sync] Fatal error:", err);
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