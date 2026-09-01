"use client";
/**
 * PushManager — opt-in Web Push di Settings > Notifications.
 * - Cek dukungan browser + status subscription
 * - Subscribe: Notification.requestPermission + pushManager.subscribe
 * - POST subscription ke /api/push/subscribe (simpan ke DB)
 * - Unsubscribe: hapus dari browser + DB
 */
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushManager() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    const sw = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(sw);
    if (!sw) { setChecked(true); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEnabled(!!sub && Notification.permission === "granted");
    } catch {
      setEnabled(false);
    }
    setChecked(true);
  }, []);

  useEffect(() => { check(); }, [check]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!pubKey) { toast.error("VAPID public key belum diset"); setBusy(false); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("Izin notifikasi ditolak browser"); setBusy(false); return; }
      const reg = await navigator.serviceWorker.ready;
      // Bersihkan subscription lama (VAPID key sebelumnya) agar tidak konflik —
      // Chrome error "push service error" jika subscribe dengan key beda saat sub lama masih ada
      try {
        const stale = await reg.pushManager.getSubscription();
        if (stale) await stale.unsubscribe();
      } catch { /* abaikan jika tidak ada */ }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("Gagal simpan subscription");
      setEnabled(true);
      toast.success("Push notification aktif di device ini");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const hint = msg.includes("push service")
        ? " — cek izin notifikasi OS (macOS: System Settings → Notifications → izinkan browser; iOS: Add to Home Screen dulu), lalu reload & coba lagi"
        : "";
      toast.error(`Gagal mengaktifkan push: ${msg}${hint}`);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Push notification dimatikan");
    } catch (e) {
      toast.error(`Gagal: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(false);
    }
  };

  if (!checked) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Memeriksa status push...
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
        Browser/device ini tidak mendukung Web Push. Gunakan Chrome/Safari terbaru.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-md bg-primary/10 p-2">
          <Smartphone className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Push Notification (Device Ini)</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? "Aktif — kamu akan menerima push untuk notif penting & pesan chat." : "Nonaktif — aktifkan untuk menerima notifikasi real-time."}
          </p>
        </div>
      </div>
      <button
        onClick={enabled ? disable : enable}
        disabled={busy}
        className={
          enabled
            ? "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        {enabled ? "Matikan" : "Aktifkan"}
      </button>
    </div>
  );
}