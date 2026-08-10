import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any;

export async function GET(req: NextRequest) {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get("channelId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const before = req.nextUrl.searchParams.get("before"); // for pagination

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  let query = supabase
    .from("chat_messages")
    .select(`
      id,
      channel_id,
      user_id,
      content,
      message_type,
      metadata,
      reply_to,
      created_at,
      profiles!inner(full_name, avatar_url, role)
    `)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: messages, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reverse to chronological order for display
  return NextResponse.json({ messages: (messages || []).reverse() });
}

export async function POST(req: NextRequest) {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { channel_id, content, message_type = "text", metadata = {}, reply_to = null } = body;

  if (!channel_id || !content?.trim()) {
    return NextResponse.json({ error: "channel_id and content required" }, { status: 400 });
  }

  // Rate limit: max 30 messages per minute per user
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { count } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneMinuteAgo);

  if ((count || 0) >= 30) {
    return NextResponse.json({ error: "Rate limit: too many messages" }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      channel_id,
      user_id: user.id,
      content: content.trim(),
      message_type,
      metadata,
      reply_to,
    })
    .select(`
      id,
      channel_id,
      user_id,
      content,
      message_type,
      metadata,
      reply_to,
      created_at,
      profiles!inner(full_name, avatar_url, role)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = req.nextUrl.searchParams.get("id");
  if (!messageId) {
    return NextResponse.json({ error: "Message id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", user.id); // Only own messages

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}