import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const db = () => createClient() as any;

export async function POST(req: NextRequest) {
  const supabase = db();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { message_id, emoji } = body;

  if (!message_id || !emoji) {
    return NextResponse.json({ error: "message_id and emoji required" }, { status: 400 });
  }

  // Toggle reaction: if exists, delete; if not, insert
  const { data: existing } = await supabase
    .from("chat_reactions")
    .select("id")
    .eq("message_id", message_id)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .single();

  if (existing) {
    await supabase
      .from("chat_reactions")
      .delete()
      .eq("id", existing.id);
    return NextResponse.json({ action: "removed" });
  }

  const { data, error } = await supabase
    .from("chat_reactions")
    .insert({ message_id, user_id: user.id, emoji })
    .select("id, message_id, user_id, emoji")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action: "added", reaction: data });
}