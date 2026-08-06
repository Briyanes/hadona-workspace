/**
 * 📑 API: Discover Sheet Tabs (Lightweight)
 * ============================================================================
 * Endpoint: GET /api/reports/tabs
 *
 * Return daftar sheet tabs dari published Google Spreadsheet — TANPA parse row.
 * Sangat ringan (~1-2s) cocok untuk:
 *   - Frontend ingin tahu ada berapa tab sebelum sync per-tab
 *   - Progress bar "Sync 1/7, 2/7, ..., 7/7"
 *
 * Compare dengan GET /api/reports/sheets yang juga parse semua row (~14s).
 *
 * Query params:
 *   ?url=https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv
 *      → override default URL dari env
 *
 * Returns: {
 *   url: string,
 *   fetchedAt: string (ISO),
 *   durationMs: number,
 *   totalTabs: number,
 *   tabs: Array<{ gid: string; name: string }>
 * }
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverSheets } from "@/lib/sheet-parser";
import { getDefaultSheetUrl } from "@/lib/report-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  console.log("[reports/tabs] GET triggered at", new Date().toISOString());

  try {
    // ── 1. Auth & permission ───────────────────────────────────────────────
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cek role — sama dengan sync route (read-only tapi tetap restricted)
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
          error: `Forbidden: role Anda "${role || "(kosong)"}" tidak diizinkan.`,
        },
        { status: 403 }
      );
    }

    // ── 2. Resolve URL ─────────────────────────────────────────────────────
    const urlParam = req.nextUrl.searchParams.get("url");
    const sheetUrl = urlParam || getDefaultSheetUrl();

    if (!sheetUrl.includes("docs.google.com/spreadsheets")) {
      return NextResponse.json(
        { error: "URL sheet tidak valid" },
        { status: 400 }
      );
    }

    // ── 3. Discover tabs ───────────────────────────────────────────────────
    console.log("[reports/tabs] Discovering tabs from:", sheetUrl);
    const tabs = await discoverSheets(sheetUrl);
    const durationMs = Date.now() - startedAt;
    console.log(
      `[reports/tabs] ✅ Found ${tabs.length} tabs in ${durationMs}ms:`,
      tabs.map((t) => `${t.name} (gid=${t.gid})`).join(", ")
    );

    return NextResponse.json({
      url: sheetUrl,
      fetchedAt: new Date().toISOString(),
      durationMs,
      totalTabs: tabs.length,
      tabs,
    });
  } catch (err) {
    console.error("[reports/tabs] Fatal error:", err);
    const durationMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
        durationMs,
      },
      { status: 500 }
    );
  }
}