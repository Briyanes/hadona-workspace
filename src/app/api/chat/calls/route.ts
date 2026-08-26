import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const db = () => createClient() as any;

// Call dianggap stale/ghost setelah 4 jam tanpa leave (mis. tab ditutup paksa
// atau browser crash). GET/POST akan auto-close record tersebut sebagai backstop
// di samping handler pagehide di frontend.
const STALE_CALL_MS = 4 * 60 * 60 * 1000;
const staleCutoff = () => new Date(Date.now() - STALE_CALL_MS).toISOString();

// GET /api/chat/calls — semua call aktif (untuk badge LIVE di sidebar)
export async function GET() {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Auto-close ghost calls agar badge LIVE tidak menetap selamanya
    await supabase
      .from("chat_channel_calls")
      .update({ ended_at: new Date().toISOString() })
      .is("ended_at", null)
      .lt("started_at", staleCutoff());

    const { data: calls, error } = await supabase
      .from("chat_channel_calls")
      .select(`
        id,
        channel_id,
        started_by,
        jitsi_room,
        started_at,
        ended_at
      `)
      .is("ended_at", null)
      .order("started_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich dengan profile starter
    const starterIds = Array.from(new Set((calls || []).map((c: any) => c.started_by)));
    let profileMap = new Map<string, any>();
    if (starterIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", starterIds);
      profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    }

    const enriched = (calls || []).map((c: any) => ({
      ...c,
      starter_profile: profileMap.get(c.started_by) || null,
    }));

    return NextResponse.json({ calls: enriched });
  } catch (err: any) {
    console.error("[chat/calls GET] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat/calls — mulai group call di channel (embed Jitsi)
export async function POST(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { channel_id } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id required" }, { status: 400 });
    }

    // Cek apakah sudah ada call aktif (belum stale) di channel ini
    const { data: existing } = await supabase
      .from("chat_channel_calls")
      .select("*")
      .eq("channel_id", channel_id)
      .is("ended_at", null)
      .gt("started_at", staleCutoff())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ call: existing });
    }

    // Tutup record ghost call lama di channel ini agar tidak menumpuk
    await supabase
      .from("chat_channel_calls")
      .update({ ended_at: new Date().toISOString() })
      .eq("channel_id", channel_id)
      .is("ended_at", null)
      .lt("started_at", staleCutoff());

    // Room name tidak predictable (channel + random suffix) — pihak luar
    // tidak bisa menebak URL room Jitsi publik untuk memperusahaan
    const jitsiRoom = `hadona-chat-${String(channel_id).slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;

    const { data: call, error } = await supabase
      .from("chat_channel_calls")
      .insert({
        channel_id,
        started_by: user.id,
        jitsi_room: jitsiRoom,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // System message: call dimulai
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      await supabase.from("chat_messages").insert({
        channel_id,
        user_id: user.id,
        content: `📹 ${me?.full_name || "Seseorang"} memulai group call`,
        message_type: "system",
        metadata: { system: true, action: "call_started", call_id: call.id },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ call });
  } catch (err: any) {
    console.error("[chat/calls POST] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/chat/calls — end call
export async function PATCH(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { call_id, channel_id } = body;

    let query = supabase
      .from("chat_channel_calls")
      .update({ ended_at: new Date().toISOString() });

    if (call_id) {
      query = query.eq("id", call_id);
    } else if (channel_id) {
      query = query.eq("channel_id", channel_id).is("ended_at", null);
    } else {
      return NextResponse.json({ error: "call_id or channel_id required" }, { status: 400 });
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // System message: call berakhir
    if (channel_id) {
      try {
        await supabase.from("chat_messages").insert({
          channel_id,
          user_id: user.id,
          content: `📹 Group call berakhir`,
          message_type: "system",
          metadata: { system: true, action: "call_ended" },
        });
      } catch { /* non-critical */ }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[chat/calls PATCH] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}