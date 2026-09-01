/**
 * Web Push helper (server-side).
 * Mengirim push notification ke semua device milik satu user.
 * Subscription kadaluarsa/invalid → auto dihapus dari DB.
 */
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Kirim push ke semua subscription milik user. Return jumlah sukses. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) {
    console.warn("[push] VAPID keys not set — skipping push");
    return 0;
  }

  const db = serviceClient();
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error || !subs?.length) return 0;

  let sent = 0;
  await Promise.allSettled(
    subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        // 404/410 = subscription expired/invalid → hapus
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
  return sent;
}