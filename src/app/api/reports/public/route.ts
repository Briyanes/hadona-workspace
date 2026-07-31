import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkPublicReportRateLimit, getClientIP } from "@/lib/rate-limit";

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
// Protected by rate limiting (60 req / 5 min / IP)
export async function GET(request: NextRequest) {
  try {
    // ─── Rate limiting ───
    const clientIP = getClientIP(request);
    const rateLimit = checkPublicReportRateLimit(clientIP);

    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil((rateLimit.resetAtMs - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Terlalu banyak request. Coba lagi nanti." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": "60",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(rateLimit.resetAtMs / 1000)),
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token || token.length < 32) {
      return NextResponse.json({ error: "Token tidak valid" }, { status: 400 });
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

    // ─── Atomic view count increment (race-condition fix) ───
    // Gunakan RPC function untuk atomic increment
    try {
      await supabase.rpc("increment_view_count", { token_input: token });
    } catch {
      // Fallback: ignore jika RPC tidak ada (tidak fatal)
    }

    // Get report data
    const { data: report, error: reportErr } = await supabase
      .from("weekly_reports")
      .select("*, client:clients(name), report_metrics(*)")
      .eq("id", shareLink.report_id)
      .single();

    if (reportErr) throw reportErr;

    // Add rate limit headers to success response
    const response = NextResponse.json({ report });
    response.headers.set("X-RateLimit-Limit", "60");
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.floor(rateLimit.resetAtMs / 1000)));

    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/reports/public] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}