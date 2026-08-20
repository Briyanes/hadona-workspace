import { NextRequest, NextResponse } from "next/server";
import { sanitizePlainText } from "@/lib/sanitize";
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

  // Ambil membership user (untuk grup private) + semua members (untuk label grup)
  let myMemberChannelIds: string[] = [];
  try {
    const { data: myMemberships } = await supabase
      .from("chat_channel_members")
      .select("channel_id, role")
      .eq("user_id", user.id);
    myMemberChannelIds = (myMemberships || []).map((m: any) => m.channel_id);
  } catch {
    // table might not exist yet
  }

  let memberCountMap = new Map<string, number>();
  let channelMembersMap = new Map<string, any[]>();
  try {
    const { data: allMembers } = await supabase
      .from("chat_channel_members")
      .select("channel_id, user_id, role");
    (allMembers || []).forEach((m: any) => {
      memberCountMap.set(m.channel_id, (memberCountMap.get(m.channel_id) || 0) + 1);
      if (!channelMembersMap.has(m.channel_id)) channelMembersMap.set(m.channel_id, []);
      channelMembersMap.get(m.channel_id)!.push({ user_id: m.user_id, role: m.role });
    });
  } catch {
    // graceful
  }

  // Filter: grup private hanya terlihat oleh member
  const visibleChannels = (channels || []).filter((ch: any) => {
    if (ch.is_private && ch.type === "group") {
      return myMemberChannelIds.includes(ch.id);
    }
    return true;
  });

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
    visibleChannels.map(async (ch: { id: string; name: string; type: string; division: string | null; created_by: string | null; created_at: string }) => {
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
        member_count: memberCountMap.get(ch.id) || 0,
        members: channelMembersMap.get(ch.id) || [],
        is_owner: ch.created_by === user.id,
        my_role: myMemberChannelIds.includes(ch.id)
          ? ((channelMembersMap.get(ch.id) || []).find((m: any) => m.user_id === user.id)?.role || null)
          : null,
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

  const body = await req.json();
  const { name, type = "general", division = null, dm_with, member_ids = [], is_private = true } = body;

  // DM channel creation — any user can create DMs (bypass role check)
  if (type === "dm" && dm_with) {
    // Check if DM channel already exists between these two users
    const dmName = [user.id, dm_with].sort().join("__");
    const { data: existing } = await supabase
      .from("chat_channels")
      .select("*")
      .eq("type", "dm")
      .eq("name", dmName)
      .single();

    if (existing) {
      return NextResponse.json({ channel: existing });
    }

    const { data: dmChannel, error: dmError } = await supabase
      .from("chat_channels")
      .insert({
        name: dmName,
        type: "dm",
        created_by: user.id,
      })
      .select()
      .single();

    if (dmError) {
      return NextResponse.json({ error: dmError.message }, { status: 500 });
    }

    return NextResponse.json({ channel: dmChannel });
  }

  // GROUP channel creation — SEMUA USER BOLEH (fitur Discord/Slack-like)
  if (type === "group") {
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nama grup wajib diisi" }, { status: 400 });
    }

    const cleanName = sanitizePlainText(name).trim().slice(0, 60);
    const slug = cleanName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { data: group, error: groupError } = await supabase
      .from("chat_channels")
      .insert({
        name: slug || `grup-${Date.now()}`,
        type: "group",
        division,
        is_private: is_private !== false,
        created_by: user.id,
      })
      .select()
      .single();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 });
    }

    // Tambahkan creator sebagai owner
    const memberRows = [
      { channel_id: group.id, user_id: user.id, role: "owner" },
      ...((member_ids || [])
        .filter((id: string) => id && id !== user.id)
        .map((id: string) => ({ channel_id: group.id, user_id: id, role: "member" }))),
    ];

    const { error: membersError } = await supabase
      .from("chat_channel_members")
      .insert(memberRows);

    if (membersError) {
      console.error("[chat/channels POST] members insert error:", membersError.message);
      // Channel tetap dibuat, tapi report error
      return NextResponse.json({
        channel: group,
        warning: "Grup dibuat tapi sebagian anggota gagal ditambahkan",
      });
    }

    // System message: grup dibuat
    try {
      await supabase.from("chat_messages").insert({
        channel_id: group.id,
        user_id: user.id,
        content: `🎉 Grup "${cleanName}" dibuat`,
        message_type: "system",
        metadata: { system: true, action: "group_created" },
      });
    } catch {
      // non-critical
    }

    return NextResponse.json({ channel: group });
  }

  // Non-DM/non-group channel creation: admin/PM only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "project_manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden — super_admin/project_manager only" }, { status: 403 });
  }

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