import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Force dynamic rendering — this route reads request.headers at runtime
export const dynamic = "force-dynamic";

/**
 * /api/debug/ads-spend — Diagnostics endpoint
 *
 * Cek apakah semua tabel & kolom yang dibutuhkan halaman /ads-spend
 * sudah ada di database. Berguna untuk troubleshoot "tabel kosong".
 *
 * Bisa diakses 2 cara:
 *   1. Visit langsung di browser (cookie auth) — https://workspace.hadona.id/api/debug/ads-spend
 *   2. API call dengan Bearer token (untuk integrasi frontend)
 *
 * Returns JSON dengan status tiap komponen:
 *   { healthy: boolean, checks: [...], summary: "..." }
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Verify user via:
 *   1. Bearer token in Authorization header (untuk API calls)
 *   2. Supabase session cookie (untuk visit langsung di browser)
 */
async function verifyUser(request: NextRequest) {
  const admin = getAdminClient();

  // ─── 1. Cek Bearer token (untuk API calls dari frontend) ───
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) return data.user;
  }

  // ─── 2. Fallback: Cek Supabase session cookie (untuk visit langsung di browser) ───
  const cookieClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll() {
          // No-op for read-only API route
        },
      },
    }
  );

  const {
    data: { user },
  } = await cookieClient.auth.getUser();

  return user || null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getAdminClient();
    const checks: Array<{
      name: string;
      status: "pass" | "fail" | "warn";
      detail: string;
    }> = [];

    // ─── 1. Cek tabel ad_accounts ───
    const { count: adAccountsCount, error: adAccountsErr } = await supabase
      .from("ad_accounts")
      .select("*", { count: "exact", head: true });

    if (adAccountsErr) {
      checks.push({
        name: "ad_accounts table",
        status: "fail",
        detail: `ERROR: ${adAccountsErr.message}`,
      });
    } else {
      checks.push({
        name: "ad_accounts table",
        status: adAccountsCount === 0 ? "warn" : "pass",
        detail: `${adAccountsCount} rows`,
      });
    }

    // ─── 2. Cek kolom pic_id di ad_accounts ───
    // Query select kolom tsrget — jika error, berarti kolom belum ada
    const { error: picIdErr } = await supabase
      .from("ad_accounts")
      .select("pic_id")
      .limit(1);
    checks.push({
      name: "ad_accounts.pic_id column",
      status: picIdErr ? "fail" : "pass",
      detail: picIdErr
        ? `MISSING — jalankan migration-production-fix.sql`
        : "Column exists",
    });

    // ─── 3. Cek kolom meta_sync_enabled ───
    const { error: metaSyncErr } = await supabase
      .from("ad_accounts")
      .select("meta_sync_enabled")
      .limit(1);
    checks.push({
      name: "ad_accounts.meta_sync_enabled column",
      status: metaSyncErr ? "fail" : "pass",
      detail: metaSyncErr
        ? `MISSING — ${metaSyncErr.message}`
        : "Column exists",
    });

    // ─── 4. Cek tabel ad_spend_logs ───
    const { count: spendLogsCount, error: spendLogsErr } = await supabase
      .from("ad_spend_logs")
      .select("*", { count: "exact", head: true });

    if (spendLogsErr) {
      checks.push({
        name: "ad_spend_logs table",
        status: "fail",
        detail: `MISSING — ${spendLogsErr.message}`,
      });
    } else {
      checks.push({
        name: "ad_spend_logs table",
        status: "pass",
        detail: `${spendLogsCount} rows`,
      });
    }

    // ─── 5. Cek tabel meta_connections ───
    const { count: metaConnCount, error: metaConnErr } = await supabase
      .from("meta_connections")
      .select("*", { count: "exact", head: true });

    if (metaConnErr) {
      checks.push({
        name: "meta_connections table",
        status: "fail",
        detail: `MISSING — ${metaConnErr.message}`,
      });
    } else {
      checks.push({
        name: "meta_connections table",
        status: "pass",
        detail: `${metaConnCount} rows`,
      });
    }

    // ─── 6. Cek tabel meta_sync_logs ───
    const { count: syncLogsCount, error: syncLogsErr } = await supabase
      .from("meta_sync_logs")
      .select("*", { count: "exact", head: true });

    if (syncLogsErr) {
      checks.push({
        name: "meta_sync_logs table",
        status: "fail",
        detail: `MISSING — ${syncLogsErr.message}`,
      });
    } else {
      checks.push({
        name: "meta_sync_logs table",
        status: "pass",
        detail: `${syncLogsCount} rows`,
      });
    }

    // ─── 7. Cek clients.logo_url ───
    const { error: logoErr } = await supabase
      .from("clients")
      .select("logo_url")
      .limit(1);
    checks.push({
      name: "clients.logo_url column",
      status: logoErr ? "fail" : "pass",
      detail: logoErr ? `MISSING — ${logoErr.message}` : "Column exists",
    });

    // ─── 8. Cek report_metrics ───
    const { error: reportMetricsErr } = await supabase
      .from("report_metrics")
      .select("platform")
      .limit(1);
    checks.push({
      name: "report_metrics table + platform column",
      status: reportMetricsErr ? "fail" : "pass",
      detail: reportMetricsErr
        ? `MISSING — ${reportMetricsErr.message}`
        : "Table & column exist",
    });

    // ─── Summary ───
    const failedCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const healthy = failedCount === 0;

    let summary: string;
    if (healthy && warnCount === 0) {
      summary = "✅ Semua komponen sehat. /ads-spend & /reports harusnya berfungsi normal.";
    } else if (healthy && warnCount > 0) {
      summary = `⚠️ Database struktur OK, tapi ada ${warnCount} warning (kemungkinan data kosong).`;
    } else {
      summary = `❌ ${failedCount} komponen MISSING. Jalankan supabase/migration-production-fix.sql di Supabase SQL Editor ASAP.`;
    }

    return NextResponse.json({
      healthy,
      summary,
      failed_count: failedCount,
      warn_count: warnCount,
      checks,
      user: { id: user.id, email: user.email },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/debug/ads-spend] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}