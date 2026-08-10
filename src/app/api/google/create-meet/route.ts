import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClientFromTokens, getOAuthClient, type GoogleTokenRow } from "@/lib/google";
import { google } from "googleapis";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load stored token
    const { data: tokenRow } = await (supabase
      .from("google_oauth_tokens") as unknown as {
      select: () => { maybeSingle: () => Promise<{ data: GoogleTokenRow | null }> };
    }).select().maybeSingle();

    if (!tokenRow) {
      return NextResponse.json(
        { error: "Google account not connected. Please connect in Settings → Integrations." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      start_datetime,
      end_datetime,
      attendees_emails = [],
      location,
    } = body as {
      title: string;
      description?: string;
      start_datetime: string;
      end_datetime?: string;
      attendees_emails?: string[];
      location?: string;
    };

    if (!title || !start_datetime) {
      return NextResponse.json(
        { error: "title and start_datetime are required" },
        { status: 400 }
      );
    }

    const oauth2Client = getOAuthClientFromTokens(tokenRow);

    // Auto-refresh token if expired
    oauth2Client.on("tokens", async (newTokens) => {
      const updated: Record<string, unknown> = {
        access_token: newTokens.access_token || tokenRow.access_token,
      };
      if (newTokens.refresh_token) {
        updated.refresh_token = newTokens.refresh_token;
      }
      if (newTokens.expiry_date) {
        updated.expiry_date = newTokens.expiry_date;
      }
      await (supabase.from("google_oauth_tokens") as unknown as {
        update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      }).update(updated).eq("user_id", user.id);
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event: Record<string, unknown> = {
      summary: title,
      description: description || "",
      start: {
        dateTime: new Date(start_datetime).toISOString(),
        timeZone: "Asia/Jakarta",
      },
      end: {
        dateTime: end_datetime
          ? new Date(end_datetime).toISOString()
          : new Date(new Date(start_datetime).getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: "Asia/Jakarta",
      },
      conferenceData: {
        createRequest: {
          requestId: `hadona-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      attendees: attendees_emails.map((email) => ({ email })),
    };

    if (location) {
      event.location = location;
    }

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    const googleEventId = response.data.id || "";
    const meetCode = response.data.conferenceData?.entryPoints?.[0]?.uri || "";
    const hangoutLink = response.data.hangoutLink || meetCode;

    return NextResponse.json({
      success: true,
      google_event_id: googleEventId,
      google_meet_code: hangoutLink,
      html_link: response.data.htmlLink || "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[google/create-meet] Error:", msg);
    return NextResponse.json(
      { error: "Failed to create Google Meet: " + msg },
      { status: 500 }
    );
  }
}

// Disconnect route — DELETE removes token
export async function DELETE() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await (supabase
      .from("google_oauth_tokens") as unknown as {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    }).delete().eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}