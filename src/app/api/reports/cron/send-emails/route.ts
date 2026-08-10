import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Cron Job: /api/reports/cron/send-emails
 *
 * Dipanggil oleh Vercel Cron setiap jam (0 * * * *)
 * Cek schedule yang aktif dan kirim email jika jamnya cocok
 *
 * Security: protected via CRON_SECRET header
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(request: NextRequest) {
  // 🔒 Strict auth: fail-closed if CRON_SECRET not set or mismatched
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = getAdminClient();

  try {
    // Waktu saat ini di Asia/Jakarta
    const now = new Date();
    const jakartaHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "numeric",
        hour12: false,
      }).format(now)
    );
    const jakartaDay = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        weekday: "short",
      }).format(now)
    );
    // Map weekday to number (0=Sunday ... 6=Saturday)
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const todayDay = isNaN(jakartaDay) ? now.getDay() : (dayMap[new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short" }).format(now)] ?? now.getDay());

    // Cari schedules yang aktif dan jamnya cocok
    const { data: schedules, error: schedErr } = await supabase
      .from("report_email_schedules")
      .select("*")
      .eq("is_active", true)
      .eq("schedule_day", todayDay)
      .eq("schedule_hour", jakartaHour);

    if (schedErr) throw schedErr;

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No schedules to process",
        checkedHour: jakartaHour,
        checkedDay: todayDay,
      });
    }

    let sentCount = 0;
    let skipCount = 0;
    let failCount = 0;
    const results: Array<{ client: string; status: string }> = [];

    for (const sched of schedules) {
      try {
        // Cari report terbaru untuk client ini (minggu ini)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const { data: reports } = await supabase
          .from("weekly_reports")
          .select("id, period_start, period_end, status, client:clients(name)")
          .eq("client_id", sched.client_id)
          .gte("created_at", weekAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(1);

        if (!reports || reports.length === 0) {
          skipCount++;
          results.push({ client: sched.client_id, status: "no_report" });
          continue;
        }

        const report = reports[0];
        const reportClient = report.client as { name?: string } | { name?: string }[] | undefined;
        const clientName = Array.isArray(reportClient) ? reportClient[0]?.name || "?" : reportClient?.name || "?";

        // Skip jika sudah dikirim untuk report ini
        if (sched.last_report_id === report.id) {
          skipCount++;
          results.push({ client: clientName, status: "already_sent" });
          continue;
        }

        // Generate share token
        const { randomBytes } = await import("crypto");
        const token = randomBytes(16).toString("hex");

        await supabase.from("shared_reports").insert({
          report_id: report.id,
          token,
          created_by: sched.created_by,
          is_active: true,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 hari
        });

        const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"}/shared/${token}`;

        // Kirim email via Resend (atau provider lain)
        const emailHtml = generateEmailTemplate({
          clientName,
          periodStart: report.period_start,
          periodEnd: report.period_end,
          shareUrl,
          status: report.status,
        });

        await sendEmail({
          to: sched.recipient_email,
          cc: sched.cc_emails || undefined,
          subject: `📊 Weekly Report: ${clientName} (${report.period_start})`,
          html: emailHtml,
        });

        // Update last_sent
        await supabase
          .from("report_email_schedules")
          .update({
            last_sent_at: new Date().toISOString(),
            last_report_id: report.id,
          })
          .eq("id", sched.id);

        // Log success
        await supabase.from("report_email_logs").insert({
          schedule_id: sched.id,
          report_id: report.id,
          recipient_email: sched.recipient_email,
          status: "sent",
        });

        sentCount++;
        results.push({ client: clientName, status: "sent" });
      } catch (err) {
        failCount++;
        const errMsg = err instanceof Error ? err.message : "Unknown";
        results.push({ client: sched.client_id, status: `failed: ${errMsg}` });

        // Log failure
        await supabase.from("report_email_logs").insert({
          schedule_id: sched.id,
          report_id: null,
          recipient_email: sched.recipient_email,
          status: "failed",
          error_message: errMsg,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: schedules.length,
      sent: sentCount,
      skipped: skipCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/send-emails] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Email sender via Resend ───
async function sendEmail({ to, cc, subject, html }: {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
}) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[sendEmail] RESEND_API_KEY not set, skipping");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Hadona Workspace <reports@hadona.id>",
      to,
      cc: cc?.join(","),
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error: ${res.status} - ${errText}`);
  }
}

// ─── Email template ───
function generateEmailTemplate({
  clientName,
  periodStart,
  periodEnd,
  shareUrl,
  status,
}: {
  clientName: string;
  periodStart: string;
  periodEnd: string;
  shareUrl: string;
  status: string;
}): string {
  const formatDate = (d: string) => {
    try {
      return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
    } catch {
      return d;
    }
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">📊 Weekly Report Ready</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">${clientName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">Halo,</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Laporan performa iklan mingguan untuk <strong style="color:#111827;">${clientName}</strong>
                periode <strong style="color:#111827;">${formatDate(periodStart)} - ${formatDate(periodEnd)}</strong> sudah tersedia.
              </p>

              <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:0 0 24px;">
                <p style="color:#92400e;font-size:13px;margin:0;">
                  📈 Status: <strong>${status.toUpperCase()}</strong>
                </p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${shareUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;">
                      Lihat Laporan Lengkap →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;text-align:center;">
                Link berlaku selama 30 hari. Hubungi account manager Anda untuk bantuan.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">
                Email ini dikirim otomatis oleh Hadona Workspace.<br>
                © ${new Date().getFullYear()} Hadona. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}