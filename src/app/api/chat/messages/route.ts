import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizePlainText } from "@/lib/sanitize";

const db = () => createClient() as any;

export async function GET(req: NextRequest) {
  try {
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

    // Step 1: Fetch messages (without risky joins first)
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
        edited_at,
        mentions,
        is_pinned,
        deleted_at
      `)
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[chat/messages GET] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    // Step 2: Fetch profiles for message authors (separate query for reliability)
    const userIds = Array.from(new Set(messages.map((m: any) => m.user_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Step 3: Fetch reactions for these messages (graceful - table may not exist yet)
    const messageIds = messages.map((m: any) => m.id);
    const reactionsMap = new Map<string, any[]>();
    try {
      const { data: reactions } = await supabase
        .from("chat_reactions")
        .select("id, message_id, user_id, emoji")
        .in("message_id", messageIds);

      (reactions || []).forEach((r: any) => {
        if (!reactionsMap.has(r.message_id)) reactionsMap.set(r.message_id, []);
        reactionsMap.get(r.message_id)!.push(r);
      });
    } catch {
      // chat_reactions table might not exist yet — skip gracefully
    }

    // Step 4: Merge data
    const enrichedMessages = messages.map((m: any) => ({
      ...m,
      profiles: profileMap.get(m.user_id) || { full_name: "Unknown", avatar_url: null, role: "user" },
      chat_reactions: reactionsMap.get(m.id) || [],
    }));

    // Reverse to chronological order for display
    return NextResponse.json({ messages: enrichedMessages.reverse() });
  } catch (err: any) {
    console.error("[chat/messages GET] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { channel_id, content, message_type = "text", metadata = {}, reply_to = null, mentions = [] } = body;

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

    // Extract valid mention UUIDs from content (@<uuid> pattern or explicit mentions array)
    const mentionRegex = /@\[([a-f0-9-]+)\]/g;
    const extractedMentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      extractedMentions.push(match[1]);
    }
    const allMentions = Array.from(new Set([...extractedMentions, ...(mentions || [])]));

    // Insert without complex joins — fetch profile separately
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id,
        user_id: user.id,
        content: sanitizePlainText(content).slice(0, 5000),
        message_type,
        metadata,
        reply_to,
        mentions: allMentions.length > 0 ? allMentions : null,
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
        edited_at,
        mentions,
        is_pinned,
        deleted_at
      `)
      .single();

    if (error) {
      console.error("[chat/messages POST] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch author profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      message: {
        ...msg,
        profiles: profile || { full_name: "Unknown", avatar_url: null, role: "user" },
        chat_reactions: [],
      },
    });
  } catch (err: any) {
    console.error("[chat/messages POST] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message_id, content } = body;

    if (!message_id || !content?.trim()) {
      return NextResponse.json({ error: "message_id and content required" }, { status: 400 });
    }

    // Fetch old content for edit history
    const { data: oldMsg } = await supabase
      .from("chat_messages")
      .select("content, user_id")
      .eq("id", message_id)
      .single();

    if (!oldMsg || oldMsg.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized to edit this message" }, { status: 403 });
    }

    // Save edit history (graceful — table may not exist)
    try {
      await supabase.from("chat_message_edits").insert({
        message_id,
        old_content: oldMsg.content,
        edited_by: user.id,
      });
    } catch {
      // edit history table might not exist — non-critical
    }

    // Update message
    const { data: msg, error } = await supabase
      .from("chat_messages")
      .update({
        content: sanitizePlainText(content).slice(0, 5000),
        edited_at: new Date().toISOString(),
      })
      .eq("id", message_id)
      .eq("user_id", user.id)
      .select(`
        id,
        channel_id,
        user_id,
        content,
        message_type,
        metadata,
        reply_to,
        created_at,
        edited_at,
        mentions,
        is_pinned,
        deleted_at
      `)
      .single();

    if (error) {
      console.error("[chat/messages PATCH] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch author profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      message: {
        ...msg,
        profiles: profile || { full_name: "Unknown", avatar_url: null, role: "user" },
        chat_reactions: [],
      },
    });
  } catch (err: any) {
    console.error("[chat/messages PATCH] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messageId = req.nextUrl.searchParams.get("id") || req.nextUrl.searchParams.get("messageId");
    if (!messageId) {
      return NextResponse.json({ error: "Message id required" }, { status: 400 });
    }

    // Soft delete: set deleted_at instead of hard delete
    const { error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("user_id", user.id); // Only own messages

    if (error) {
      console.error("[chat/messages DELETE] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[chat/messages DELETE] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}