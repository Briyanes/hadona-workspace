/**
 * POST /api/push/relay — dipanggil oleh trigger DB (pg_net) setiap INSERT
 * ke tabel notifications. Mengirim:
 *   1. Web push ke semua device user
 *   2. Email instan utk task_assigned (jika user aktifkan email_task)
 *
 * Auth: header X-Relay-Secret === PUSH_RELAY_SECRET (sama yang di-inject
 * ke trigger oleh run-migration-v103.mjs).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";
import { sendEmail, taskAssignEmailTemplate } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-relay-secret");
  const expected = process.env.PUSH_RELAY_SECRET || process.env.CRON_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const n = await req.json().catch(() => null);
  if (!n?.user_id || !n?.title) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = serviceClient();

  // 1. Web push ke semua device
  let pushed = 0;
  try {
    pushed = await sendPushToUser(n.user_id, {
      title: n.title,
      body: n.body || "",
      url: n.link || "/",
      tag: `hadona-${n.type || "general"}`,
    });
  } catch (err) {
    console.error("[push/relay] sendPush error:", err);
  }

  // 2. Email instan utk task_assigned (honor user prefs email_task)
  let emailed = false;
  if (n.type === "task_assigned") {
    try {
      const { data: profile } = await db
        .from("users")
        .select("email, full_name, notification_prefs")
        .eq("id", n.user_id)
        .maybeSingle();

      const prefs = profile?.notification_prefs;
      const emailOk = !prefs || (prefs as any)?.email_task !== false;
      if (profile?.email && emailOk) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id";
        const html = taskAssignEmailTemplate({
          assigneeName: profile.full_name || "Tim",
          taskTitle: n.title,
          taskUrl: `${appUrl}${n.link || "/tasks"}`,
          assignedBy: (n as any).actor_name || "System",
        });
        await sendEmail({
          to: profile.email,
          subject: `New Task: ${n.title}`,
          html,
        });
        emailed = true;
      }
    } catch (err) {
      console.error("[push/relay] email error:", err);
    }
  }

  return NextResponse.json({ ok: true, pushed, emailed });
}