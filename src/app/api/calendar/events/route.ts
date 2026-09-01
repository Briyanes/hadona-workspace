import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { getOAuthClientFromTokens, type GoogleTokenRow } from "@/lib/google";
import { google } from "googleapis";

interface EventRow {
  id: string;
  title: string;
  google_event_id?: string;
  status?: string;
  client?: { name?: string };
}

/**
 * PATCH /api/calendar/events
 * Reschedule a calendar event (update datetime).
 * If google_event_id exists, also updates Google Calendar event → auto-notifies attendees.
 *
 * Body:
 *   event_id: string       — calendar_events.id
 *   start_datetime: string — new start (ISO or datetime-local)
 *   end_datetime?: string  — new end (optional)
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { event_id, start_datetime, end_datetime, meeting_link, google_event_id } = body as {
      event_id: string;
      start_datetime?: string;
      end_datetime?: string;
      meeting_link?: string | null;
      google_event_id?: string | null;
    };

    // Link-only update (retroactive Meet generation) doesn't require start_datetime
    const isLinkUpdate = meeting_link !== undefined || google_event_id !== undefined;

    if (!event_id || (!start_datetime && !isLinkUpdate)) {
      return NextResponse.json({ error: "event_id is required (start_datetime required for reschedule)" }, { status: 400 });
    }

    // ─── Fetch event from DB ───
    const { data: eventRow, error: fetchErr } = await supabase
      .from("calendar_events")
      .select("id, title, google_event_id, status, client:clients(name)")
      .eq("id", event_id)
      .single() as unknown as { data: EventRow | null; error: unknown };

    if (fetchErr || !eventRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    let newStartIso: string | null = null;
    let newEndIso: string | null = null;
    if (start_datetime) {
      newStartIso = new Date(start_datetime).toISOString();
      newEndIso = end_datetime
        ? new Date(end_datetime).toISOString()
        : new Date(new Date(start_datetime).getTime() + 60 * 60 * 1000).toISOString();
    }

    // ─── Update Google Calendar if linked ───
    const googleEventId = eventRow?.google_event_id;
    if (googleEventId && newStartIso && newEndIso) {
      // Load Google OAuth token
      const { data: tokenRow } = await (supabase
        .from("google_oauth_tokens") as unknown as {
        select: () => { maybeSingle: () => Promise<{ data: GoogleTokenRow | null }> };
      }).select().maybeSingle();

      if (tokenRow) {
        try {
          const oauth2Client = getOAuthClientFromTokens(tokenRow);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          await calendar.events.patch({
            calendarId: "primary",
            eventId: googleEventId,
            requestBody: {
              start: { dateTime: newStartIso, timeZone: "Asia/Jakarta" },
              end: { dateTime: newEndIso, timeZone: "Asia/Jakarta" },
            },
            sendUpdates: "all", // ← Google auto-emails all attendees about the change
          });
        } catch (gErr) {
          console.error("[calendar/events PATCH] Google update failed:", gErr);
          // Don't fail — DB update still proceeds
        }
      }
    }

    // ─── Update DB ───
    const updatePayload: Record<string, unknown> = {};
    if (newStartIso && newEndIso) {
      updatePayload.start_datetime = newStartIso;
      updatePayload.end_datetime = newEndIso;
    }
    if (meeting_link !== undefined) updatePayload.meeting_link = meeting_link;
    if (google_event_id !== undefined) updatePayload.google_event_id = google_event_id;

    const { error: updateErr } = await (supabase
      .from("calendar_events") as unknown as {
      update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    }).update(updatePayload).eq("id", event_id);

    if (updateErr) {
      const errMsg = (updateErr as { message?: string }).message || "Unknown DB error";
      return NextResponse.json({ error: "Failed to update event: " + errMsg }, { status: 500 });
    }

    // ─── Notify PM via in-app notification (only on reschedule, if linked_task exists) ───
    try {
      if (newStartIso) {
      const admin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      // Find PM assigned to linked task
      const { data: linkedTask } = await admin
        .from("calendar_events")
        .select("linked_task_id")
        .eq("id", event_id)
        .single();

      const taskId = (linkedTask as { linked_task_id?: string })?.linked_task_id;
      if (taskId) {
        const { data: assignee } = await admin
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId)
          .single();

        const pmUserId = (assignee as { user_id?: string })?.user_id;
        const clientName = eventRow?.client?.name;

        if (pmUserId) {
          await admin.from("notifications").insert({
            user_id: pmUserId,
            type: "meeting_rescheduled",
            title: "📅 Meeting di-reschedule",
            body: `Meeting "${eventRow?.title || ""}"${clientName ? ` dengan ${clientName}` : ""} dijadwalkan ulang ke ${new Date(newStartIso).toLocaleString("id-ID")}.`,
            link: "/calendar",
          });
        }
      }
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      success: true,
      message: newStartIso
        ? "Meeting rescheduled successfully. Attendees notified via email."
        : "Meeting link updated successfully.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[calendar/events PATCH] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/calendar/events
 * Cancel a calendar event (soft delete: status = 'cancelled').
 * If google_event_id exists, also cancels in Google Calendar → auto-notifies attendees.
 *
 * Body:
 *   event_id: string — calendar_events.id
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { event_id } = body as { event_id: string };

    if (!event_id) {
      return NextResponse.json({ error: "event_id is required" }, { status: 400 });
    }

    // ─── Fetch event ───
    const { data: eventRow, error: fetchErr } = await supabase
      .from("calendar_events")
      .select("id, title, google_event_id, client:clients(name)")
      .eq("id", event_id)
      .single() as unknown as { data: EventRow | null; error: unknown };

    if (fetchErr || !eventRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // ─── Delete from Google Calendar if linked ───
    const googleEventId = eventRow?.google_event_id;
    if (googleEventId) {
      const { data: tokenRow } = await (supabase
        .from("google_oauth_tokens") as unknown as {
        select: () => { maybeSingle: () => Promise<{ data: GoogleTokenRow | null }> };
      }).select().maybeSingle();

      if (tokenRow) {
        try {
          const oauth2Client = getOAuthClientFromTokens(tokenRow);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });

          await calendar.events.delete({
            calendarId: "primary",
            eventId: googleEventId,
            sendUpdates: "all", // ← Google auto-emails attendees: "Meeting cancelled"
          });
        } catch (gErr) {
          console.error("[calendar/events DELETE] Google delete failed:", gErr);
        }
      }
    }

    // ─── Soft-delete in DB ───
    const { error: updateErr } = await (supabase
      .from("calendar_events") as unknown as {
      update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    }).update({ status: "cancelled" }).eq("id", event_id);

    if (updateErr) {
      const errMsg = (updateErr as { message?: string }).message || "Unknown DB error";
      return NextResponse.json({ error: "Failed to cancel event: " + errMsg }, { status: 500 });
    }

    // ─── Notify PM ───
    try {
      const admin = createSupabaseAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const { data: linkedTask } = await admin
        .from("calendar_events")
        .select("linked_task_id")
        .eq("id", event_id)
        .single();

      const taskId = (linkedTask as { linked_task_id?: string })?.linked_task_id;
      if (taskId) {
        const { data: assignee } = await admin
          .from("task_assignees")
          .select("user_id")
          .eq("task_id", taskId)
          .single();

        const pmUserId = (assignee as { user_id?: string })?.user_id;
        const clientName = eventRow?.client?.name;

        if (pmUserId) {
          await admin.from("notifications").insert({
            user_id: pmUserId,
            type: "meeting_cancelled",
            title: "❌ Meeting dibatalkan",
            body: `Meeting "${eventRow?.title || ""}"${clientName ? ` dengan ${clientName}` : ""} telah dibatalkan.`,
            link: "/calendar",
          });
        }
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({
      success: true,
      message: "Meeting cancelled. Attendees notified via email.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[calendar/events DELETE] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}