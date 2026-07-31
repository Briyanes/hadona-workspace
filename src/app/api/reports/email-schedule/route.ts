import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const supabase = getAdminClient();

    let query = supabase.from("report_email_schedules").select("*");
    if (clientId) query = query.eq("client_id", clientId);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ schedules: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { action } = body;
    const supabase = getAdminClient();

    switch (action) {
      case "create": {
        const { clientId, recipientEmail, ccEmails, scheduleDay, scheduleHour } = body;
        if (!clientId || !recipientEmail) {
          return NextResponse.json({ error: "clientId & recipientEmail required" }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail)) {
          return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
        }

        const { data, error } = await supabase
          .from("report_email_schedules")
          .insert({
            client_id: clientId,
            recipient_email: recipientEmail,
            cc_emails: ccEmails || null,
            schedule_day: scheduleDay ?? 1, // default Monday
            schedule_hour: scheduleHour ?? 9, // default 9 AM
            timezone: "Asia/Jakarta",
            is_active: true,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, schedule: data });
      }

      case "update": {
        const { id, ...updates } = body;
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

        const { data, error } = await supabase
          .from("report_email_schedules")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, schedule: data });
      }

      case "delete": {
        const { id } = body;
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

        const { error } = await supabase.from("report_email_schedules").delete().eq("id", id);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      case "toggle": {
        const { id } = body;
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

        const { data: current } = await supabase
          .from("report_email_schedules")
          .select("is_active")
          .eq("id", id)
          .single();

        const { error } = await supabase
          .from("report_email_schedules")
          .update({ is_active: !current?.is_active })
          .eq("id", id);

        if (error) throw error;
        return NextResponse.json({ success: true, is_active: !current?.is_active });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}