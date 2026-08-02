/**
 * Email Templates Reusable
 * Pattern sama dengan reports cron email — HTML inline styles
 */

interface ApprovalEmailParams {
  userName: string;
  loginUrl: string;
  division?: string | string[];
}

interface RejectionEmailParams {
  userName: string;
  reason: string;
  supportEmail?: string;
}

interface TaskAssignEmailParams {
  assigneeName: string;
  taskTitle: string;
  clientName?: string;
  dueDate?: string;
  taskUrl: string;
  assignedBy: string;
}

// ─── APPROVAL EMAIL ───
export function approvalEmailTemplate({ userName, loginUrl, division }: ApprovalEmailParams): string {
  const divisions = Array.isArray(division) ? division.join(", ") : division || "—";
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
          <tr>
            <td style="background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">✅ Akun Disetujui!</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">Selamat datang di Hadona Workspace</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">Halo <strong>${userName}</strong>,</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Akun Anda telah disetujui oleh admin. Anda sekarang bisa mengakses Hadona Workspace
                dan mulai berkolaborasi dengan tim.
              </p>
              <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:0 0 24px;">
                <p style="color:#166534;font-size:13px;margin:0;">
                  🏢 Divisi: <strong>${divisions}</strong>
                </p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;">
                      Masuk ke Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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

// ─── REJECTION EMAIL ───
export function rejectionEmailTemplate({ userName, reason, supportEmail }: RejectionEmailParams): string {
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
          <tr>
            <td style="background:linear-gradient(135deg,#ef4444 0%,#dc2626 100%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">⚠️ Akses Ditolak</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">Hadona Workspace</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">Halo <strong>${userName}</strong>,</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Mohon maaf, permintaan akses Anda ke Hadona Workspace telah ditolak.
              </p>
              <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:0 0 24px;">
                <p style="color:#991b1b;font-size:13px;margin:0 0 8px;"><strong>Alasan:</strong></p>
                <p style="color:#7f1d1d;font-size:13px;margin:0;">${reason}</p>
              </div>
              <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">
                Jika Anda merasa ini adalah kesalahan, silakan hubungi:
              </p>
              <p style="color:#374151;font-size:13px;margin:0;">
                📧 ${supportEmail || "admin@hadona.id"}
              </p>
            </td>
          </tr>
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

// ─── TASK ASSIGNMENT EMAIL ───
export function taskAssignEmailTemplate({ assigneeName, taskTitle, clientName, dueDate, taskUrl, assignedBy }: TaskAssignEmailParams): string {
  const formatDate = (d?: string) => {
    if (!d) return "—";
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
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b 0%,#ef4444 100%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">📋 Task Baru</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:8px 0 0;">Anda memiliki task baru</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">Halo <strong>${assigneeName}</strong>,</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                <strong>${assignedBy}</strong> telah menugaskan Anda untuk task berikut:
              </p>
              <div style="background:#fffbeb;border-radius:8px;padding:16px;margin:0 0 24px;">
                <p style="color:#111827;font-size:16px;font-weight:600;margin:0 0 8px;">${taskTitle}</p>
                <p style="color:#92400e;font-size:13px;margin:0;">🏢 Client: ${clientName || "—"}</p>
                <p style="color:#92400e;font-size:13px;margin:4px 0 0;">📅 Deadline: ${formatDate(dueDate)}</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${taskUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;">
                      Lihat Task →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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

// ─── EMAIL SENDER (Resend) ───
export async function sendEmail({ to, cc, subject, html }: {
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

// ─── DAILY/WEEKLY DIGEST EMAIL ───
interface DigestEmailParams {
  userName: string;
  period: "daily" | "weekly";
  stats: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    pendingReports: number;
    activeClients: number;
    totalBudget: number;
    weeklySpend?: number;
    avgRoas?: number;
  };
  myTasks: { title: string; client?: string; dueDate?: string; priority: string }[];
  dashboardUrl: string;
}

export function digestEmailTemplate({ userName, period, stats, myTasks, dashboardUrl }: DigestEmailParams): string {
  const periodLabel = period === "weekly" ? "Mingguan" : "Harian";
  const periodIcon = period === "weekly" ? "📊" : "📋";
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const taskRows = myTasks.slice(0, 8).map((t) => {
    const priorityColor = t.priority === "urgent" ? "#ef4444" : t.priority === "high" ? "#f59e0b" : "#6b7280";
    const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${priorityColor};margin-right:8px;"></span>
          <span style="color:#111827;font-size:13px;font-weight:500;">${t.title}</span>
          ${t.client ? `<span style="color:#6b7280;font-size:12px;margin-left:6px;">· ${t.client}</span>` : ""}
          ${dueStr ? `<span style="color:#9ca3af;font-size:11px;margin-left:6px;">📅 ${dueStr}</span>` : ""}
        </td>
      </tr>`;
  }).join("");

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
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;font-weight:700;">${periodIcon} Digest ${periodLabel}</h1>
              <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:8px 0 0;">${today}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 20px;">Halo <strong>${userName}</strong>,</p>
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Berikut ringkasan ${period === "weekly" ? "minggu ini" : "hari ini"}:
              </p>

              <!-- Stats Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="33%" style="padding:0 6px;">
                    <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
                      <p style="color:#16a34a;font-size:24px;font-weight:700;margin:0;">${stats.completedTasks}</p>
                      <p style="color:#166534;font-size:11px;margin:4px 0 0;">Selesai</p>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 6px;">
                    <div style="background:#fffbeb;border-radius:8px;padding:12px;text-align:center;">
                      <p style="color:#d97706;font-size:24px;font-weight:700;margin:0;">${stats.totalTasks}</p>
                      <p style="color:#92400e;font-size:11px;margin:4px 0 0;">Total Tugas</p>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 6px;">
                    <div style="background:#fef2f2;border-radius:8px;padding:12px;text-align:center;">
                      <p style="color:#dc2626;font-size:24px;font-weight:700;margin:0;">${stats.overdueTasks}</p>
                      <p style="color:#991b1b;font-size:11px;margin:4px 0 0;">Overdue</p>
                    </div>
                  </td>
                </tr>
              </table>

              ${stats.weeklySpend ? `
              <div style="background:#f0f9ff;border-radius:8px;padding:12px;margin-bottom:24px;">
                <p style="color:#0c4a6e;font-size:13px;margin:0;">
                  💰 Ad Spend: <strong>Rp ${stats.weeklySpend.toLocaleString("id-ID")}</strong>
                  ${stats.avgRoas ? ` · ROAS: <strong>${stats.avgRoas.toFixed(2)}x</strong>` : ""}
                </p>
              </div>` : ""}

              <!-- Task List -->
              ${myTasks.length > 0 ? `
              <p style="color:#374151;font-size:14px;font-weight:600;margin:0 0 12px;">📌 Tugas Anda:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                ${taskRows}
              </table>` : `
              <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
                <p style="color:#16a34a;font-size:13px;margin:0;">✅ Tidak ada tugas mendesak!</p>
              </div>`}

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;">
                      Buka Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;">
              <p style="color:#9ca3af;font-size:11px;margin:0;text-align:center;">
                Email ini dikirim otomatis oleh Hadona Workspace.<br>
                Ubah preferensi notifikasi di Settings → Notifications<br>
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
