import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const db = () => createClient() as any;

// POST: Mark channel as read
export async function POST(req: NextRequest) {
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

  // Upsert read receipt
  const { error } = await supabase
    .from("chat_read_receipts")
    .upsert({
      user_id: user.id,
      channel_id,
      last_read_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}