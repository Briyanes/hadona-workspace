/**
 * POST /api/push/test — kirim push test ke SEMUA device user yang login.
 * Validasi rantai penuh: VAPID keys → push_subscriptions → push service.
 * Return jumlah device yang sukses menerima.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pushed = await sendPushToUser(user.id, {
    title: "🔔 Tes Push Hadona",
    body: "Rantai push server → device Anda berhasil! Pesan ini aman diabaikan.",
    url: "/settings/notifications",
    tag: "hadona-test",
  });

  if (pushed === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Tidak ada device yang menerima push. Pastikan push sudah diaktifkan di device ini (tombol Aktifkan) dan VAPID keys ter-set.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, pushed });
}
