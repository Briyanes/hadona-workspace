import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const db = () => createClient() as any;

// GET /api/chat/members?channelId=xxx — daftar member grup dengan profile
export async function GET(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channelId = req.nextUrl.searchParams.get("channelId");
    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const { data: members, error } = await supabase
      .from("chat_channel_members")
      .select("id, channel_id, user_id, role, joined_at")
      .eq("channel_id", channelId)
      .order("joined_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich dengan profiles
    const userIds = (members || []).map((m: any) => m.user_id);
    let profileMap = new Map<string, any>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role, division")
        .in("id", userIds);
      profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    }

    const enriched = (members || []).map((m: any) => ({
      ...m,
      profile: profileMap.get(m.user_id) || { full_name: "Unknown", avatar_url: null },
    }));

    return NextResponse.json({ members: enriched });
  } catch (err: any) {
    console.error("[chat/members GET] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/chat/members — invite member (owner only) / join grup public
export async function POST(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { channel_id, user_ids = [], action = "invite" } = body;

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id required" }, { status: 400 });
    }

    // Ambil channel info
    const { data: channel } = await supabase
      .from("chat_channels")
      .select("id, name, type, is_private, created_by")
      .eq("id", channel_id)
      .single();

    if (!channel) {
      return NextResponse.json({ error: "Channel tidak ditemukan" }, { status: 404 });
    }

    // Self-join grup public
    if (action === "join") {
      if (channel.type !== "group") {
        return NextResponse.json({ error: "Hanya grup yang bisa di-join" }, { status: 400 });
      }
      if (channel.is_private) {
        return NextResponse.json({ error: "Grup private — minta invite dari owner" }, { status: 403 });
      }
      const { error } = await supabase
        .from("chat_channel_members")
        .upsert({ channel_id, user_id: user.id, role: "member" }, { onConflict: "channel_id,user_id" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // System message
      try {
        const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
        await supabase.from("chat_messages").insert({
          channel_id,
          user_id: user.id,
          content: `${me?.full_name || "Seseorang"} bergabung ke grup 🎉`,
          message_type: "system",
          metadata: { system: true, action: "member_joined" },
        });
      } catch { /* non-critical */ }
      return NextResponse.json({ success: true });
    }

    // Invite member — owner grup atau admin/PM
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isPrivileged = myProfile && ["super_admin", "project_manager"].includes(myProfile.role);

    if (!isPrivileged) {
      const { data: myMembership } = await supabase
        .from("chat_channel_members")
        .select("role")
        .eq("channel_id", channel_id)
        .eq("user_id", user.id)
        .single();

      if (!myMembership || myMembership.role !== "owner") {
        return NextResponse.json({ error: "Hanya owner grup yang bisa invite" }, { status: 403 });
      }
    }

    if (!user_ids || user_ids.length === 0) {
      return NextResponse.json({ error: "user_ids required" }, { status: 400 });
    }

    const rows = user_ids
      .filter((id: string) => id && id !== user.id)
      .map((id: string) => ({ channel_id, user_id: id, role: "member" }));

    if (rows.length === 0) {
      return NextResponse.json({ error: "Tidak ada user valid untuk diinvite" }, { status: 400 });
    }

    const { error } = await supabase
      .from("chat_channel_members")
      .upsert(rows, { onConflict: "channel_id,user_id", ignoreDuplicates: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // System message
    try {
      const { data: addedProfiles } = await supabase
        .from("profiles")
        .select("full_name")
        .in("id", rows.map((r: any) => r.user_id));
      const names = (addedProfiles || []).map((p: any) => p.full_name).join(", ");
      await supabase.from("chat_messages").insert({
        channel_id,
        user_id: user.id,
        content: `${names} ditambahkan ke grup ✨`,
        message_type: "system",
        metadata: { system: true, action: "member_added" },
      });
    } catch { /* non-critical */ }

    return NextResponse.json({ success: true, added: rows.length });
  } catch (err: any) {
    console.error("[chat/members POST] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/chat/members?channelId=xxx&userId=yyy — kick (owner) atau leave (self)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = db();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const channelId = req.nextUrl.searchParams.get("channelId");
    const targetUserId = req.nextUrl.searchParams.get("userId") || user.id; // default: leave sendiri

    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    // Cek permission: boleh hapus jika self-leave, owner, atau admin/PM
    if (targetUserId !== user.id) {
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const isPrivileged = myProfile && ["super_admin", "project_manager"].includes(myProfile.role);

      if (!isPrivileged) {
        const { data: myMembership } = await supabase
          .from("chat_channel_members")
          .select("role")
          .eq("channel_id", channelId)
          .eq("user_id", user.id)
          .single();

        if (!myMembership || myMembership.role !== "owner") {
          return NextResponse.json({ error: "Hanya owner yang bisa mengeluarkan member" }, { status: 403 });
        }
      }
    }

    const { error } = await supabase
      .from("chat_channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", targetUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[chat/members DELETE] Unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}