import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET /api/reports/public?token=xxx
// Public endpoint (no auth required) untuk akses shared report
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const supabase = getAdminClient();

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

    // Best-effort view count increment
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/reports/public] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}