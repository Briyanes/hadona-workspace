/**
 * 📋 API: List & Preview semua Sheet tabs dari published Google Spreadsheet
 * ============================================================================
 * Endpoint: GET /api/reports/sheets
 *
 * Query params (opsional):
 *   ?url=https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv
 *      → override default URL dari env
 *   ?preview=5
 *      → jumlah row preview per sheet (default 5, max 20)
 *
 * Auth: wajib login. Sama dengan sync route — super_admin / project_manager /
 * creative_director. Read-only (tidak tulis DB).
 *
 * Returns: {
 *   url, fetchedAt, totalSheets, totalRows, totalParsed,
 *   sheets: Array<{
 *     gid, name, rowCount, parsedCount, errors,
 *     headerRow: string[],
 *     previewRows: ParsedRow[]   // di-truncate sesuai ?preview
 *   }>,
 *   errors: string[]
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAndParseAllSheets } from "@/lib/sheet-parser";
import { getDefaultSheetUrl } from "@/lib/report-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
    try {
    // ── 1. Auth & permission ───────────────────────────────────────────────
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cek role — sama dengan sync route
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role: string } | null)?.role;
    const allowedRoles = ["super_admin", "project_manager", "creative_director"];
    if (!allowedRoles.includes(role || "")) {
      return NextResponse.json(
        {
          error: `Forbidden: role Anda "${role || "(kosong)"}" tidak diizinkan. Yang diizinkan: ${allowedRoles.join(", ")}`,
          debug: { userRole: role },
        },
        { status: 403 }
      );
    }

    // ── 2. Parse query ─────────────────────────────────────────────────────
    const url = new URL(req.url);
    const sheetUrl = url.searchParams.get("url") || getDefaultSheetUrl();
    const previewParam = url.searchParams.get("preview");
    let previewLimit = 5;
    if (previewParam) {
      const n = parseInt(previewParam, 10);
      if (!isNaN(n) && n > 0) previewLimit = Math.min(n, 20);
    }

    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      return NextResponse.json(
        { error: "URL sheet tidak valid" },
        { status: 400 }
      );
    }

        // ── 3. Fetch & parse all sheets ────────────────────────────────────────
    const multi = await fetchAndParseAllSheets(sheetUrl);

    // ── 4. Map ke response shape ───────────────────────────────────────────
    const sheets = multi.sheets.map((s) => {
      const headerRow = s.rows[0] || [];
      return {
        gid: s.gid,
        name: s.name,
        rowCount: s.rows.length,
        parsedCount: s.parsed.totalRows,
        errors: s.parsed.errors,
        headerRow: headerRow.slice(0, 12), // limit kolom agar response tidak besar
        previewRows: s.parsed.rows.slice(0, previewLimit).map((r) => ({
          rowIndex: r.rowIndex,
          date: r.date ? r.date.toISOString().slice(0, 10) : null,
          clientName: r.clientName,
          picName: r.picName,
          division: r.division,
          platform: r.platform,
          detectedObjective: r.detectedObjective,
          periodStart: r.periodStart ? r.periodStart.toISOString().slice(0, 10) : null,
          periodEnd: r.periodEnd ? r.periodEnd.toISOString().slice(0, 10) : null,
          periodRawText: r.periodRawText,
          metrics: r.metrics.slice(0, 10).map((m) => ({
            key: m.key,
            rawLabel: m.rawLabel,
            value: m.value,
            unit: m.unit,
          })),
          analysisText: r.analysisText ? r.analysisText.slice(0, 280) : "",
          status: r.status,
          parseWarnings: r.parseWarnings,
        })),
      };
    });

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(2);
        return NextResponse.json({
      url: sheetUrl,
      fetchedAt: new Date().toISOString(),
      durationSec: parseFloat(durationSec),
      totalSheets: sheets.length,
      totalRows: multi.totalRows,
      totalParsed: multi.totalParsed,
      sheets,
      errors: multi.errors,
    });
  } catch (err) {
    console.error("[reports/sheets] Fatal error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal server error",
        durationSec: ((Date.now() - startedAt) / 1000).toFixed(2),
      },
      { status: 500 }
    );
  }
}