/**
 * POST /api/push/subscribe — simpan push subscription device user login.
 * DELETE — hapus subscription (unsubscribe / logout).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
  }

  // Upsert by endpoint (unique) — device sama login ulang tidak duplikat
  // (tabel baru v103 — belum ada di generated types, jadi di-cast)
  const { error } = await (supabase.from("push_subscriptions") as any)
    .upsert(
      {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

  if (error) {
    console.error("[push/subscribe] upsert error:", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const { error } = await (supabase.from("push_subscriptions") as any)
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}