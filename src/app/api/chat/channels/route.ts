import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const db = () => createClient() as any;

export async function GET() {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, division")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: channels, error } = await supabase
    .from("chat_channels")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get unread counts for each channel
  const { data: receipts } = await supabase
    .from("chat_read_receipts")
    .select("channel_id, last_read_at")
    .eq("user_id", user.id);

  const receiptMap = new Map(
    (receipts || []).map((r: { channel_id: string; last_read_at: string }) => [
      r.channel_id,
      r.last_read_at,
    ])
  );

  const channelsWithUnread = await Promise.all(
    (channels || []).map(async (ch: { id: string; name: string; type: string; division: string | null; created_by: string | null; created_at: string }) => {
      const lastRead = receiptMap.get(ch.id);
      let unreadCount = 0;

      const countQuery = supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", ch.id);

      if (lastRead) {
        countQuery.gt("created_at", lastRead);
      }

      const { count } = await countQuery;
      unreadCount = count || 0;

      return {
        ...ch,
        unread_count: unreadCount,
      };
    })
  );

  return NextResponse.json({ channels: channelsWithUnread });
}

export async function POST(req: NextRequest) {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden — admin/manager only" }, { status: 403 });
  }

  const body = await req.json();
  const { name, type = "general", division = null } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Channel name required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chat_channels")
    .insert({
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      type,
      division,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel: data });
}