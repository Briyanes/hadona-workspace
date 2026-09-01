"use client";
/**
 * PushManager — opt-in Web Push di Settings > Notifications.
 * - Deteksi browser (Brave punya setting khusus "Use Google services for push messaging")
 * - Panel diagnostik: permission, service worker, koneksi ke FCM
 * - Subscribe dengan auto-recovery: gagal → reset SW → retry
 * - Tes notifikasi lokal (memvalidasi izin OS tanpa server)
 */
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Loader2, Smartphone, ShieldAlert, CheckCircle2, XCircle, Zap } from "lucide-react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

type BrowserInfo = { name: string; isBrave: boolean; isIOS: boolean; isSafari: boolean; isFirefox: boolean };

function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && ((navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1);
  const isFirefox = ua.includes("Firefox");
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  // Brave: punya navigator.brave; fallback deteksi via UA tidak reliable — cek async terpisah
  return { name: isIOS ? "iOS Safari" : isFirefox ? "Firefox" : isSafari ? "Safari" : "Chromium", isBrave: false, isIOS, isSafari, isFirefox };
}

export function PushManager() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [browser, setBrowser] = useState<BrowserInfo | null>(null);
  const [fcmOk, setFcmOk] = useState<boolean | null>(null); // null = belum dicek
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("unsupported");

  // Deteksi Brave (async karena navigator.brave adalah function)
  useEffect(() => {
    const b = detectBrowser();
    const nav = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } };
    if (typeof nav.brave?.isBrave === "function") {
      nav.brave.isBrave().then((v) => setBrowser({ ...b, isBrave: v, name: v ? "Brave" : b.name })).catch(() => setBrowser(b));
    } else {
      setBrowser(b);
    }
  }, []);

  // Cek koneksi ke push service Google (FCM) — dipakai Chromium-based browser
  const checkFcm = useCallback(async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      await fetch("https://fcm.googleapis.com/fcm/send", { method: "HEAD", signal: ctrl.signal, mode: "no-cors" });
      clearTimeout(t);
      setFcmOk(true); // no-cors: tidak throw = reachable (opaque response)
    } catch {
      setFcmOk(false);
    }
  }, []);

  const check = useCallback(async () => {
    const sw = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(sw);
    setPerm("Notification" in window ? Notification.permission : "unsupported");
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

  useEffect(() => {
    check();
    checkFcm();
  }, [check, checkFcm]);

  const subscribeOnce = async (pubKey: string) => {
    const reg = await navigator.serviceWorker.ready;
    // Bersihkan subscription lama (VAPID key sebelumnya) agar tidak konflik
    try {
      const stale = await reg.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();
    } catch { /* abaikan */ }
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!pubKey) { toast.error("VAPID public key belum diset"); setBusy(false); return; }
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        setPerm(p);
        if (p !== "granted") { toast.error("Izin notifikasi ditolak browser"); setBusy(false); return; }
      }
      let sub;
      try {
        sub = await subscribeOnce(pubKey);
      } catch (firstErr) {
        // Auto-recovery: reset service worker total lalu retry sekali
        const msg1 = firstErr instanceof Error ? firstErr.message : "";
        console.warn("[push] subscribe gagal, coba recovery SW:", msg1);
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
          await navigator.serviceWorker.register("/sw.js");
          await navigator.serviceWorker.ready;
          sub = await subscribeOnce(pubKey);
        } catch (secondErr) {
          throw secondErr instanceof Error ? secondErr : firstErr;
        }
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("Gagal simpan subscription");
      setEnabled(true);
      toast.success("Push notification aktif di device ini 🎉");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const isBrave = browser?.isBrave;
      const isPushServiceErr = msg.toLowerCase().includes("push service");
      let hint = "";
      if (isPushServiceErr && isBrave) {
        hint = " — Brave: buka brave://settings/privacy → aktifkan “Use Google services for push messaging” → reload halaman → coba lagi. Atau klik ikon singa di address bar → turunkan Shields untuk situs ini.";
      } else if (isPushServiceErr) {
        hint = ` — cek: (1) izin OS: System Settings → Notifications → ${browser?.name ?? "browser"} → Allow; (2) jaringan tidak memblokir fcm.googleapis.com (cek indikator koneksi di bawah); lalu reload & coba lagi.`;
      } else if (msg.toLowerCase().includes("permission")) {
        hint = " — buka pengaturan site (ikon di kiri address bar) → Notifications → Allow.";
      }
      toast.error(`Gagal mengaktifkan push: ${msg}${hint}`, { duration: 12000 });
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

  // Tes notifikasi lokal — validasi izin browser+OS tanpa server;
  // side-effect bagus: memancing browser muncul di macOS System Settings → Notifications
  const testLocal = async () => {
    if (!("Notification" in window)) { toast.error("Browser tidak mendukung Notification API"); return; }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPerm(p);
    if (p !== "granted") { toast.error("Izin notifikasi belum granted — cek pengaturan site & OS"); return; }
    try {
      const n = new Notification("Tes Notifikasi Hadona ✅", {
        body: "Kalau ini muncul, jalur notifikasi browser+OS sudah benar.",
        icon: "/icon.png",
      });
      n.onclick = () => { window.focus(); n.close(); };
      toast.success("Notifikasi lokal terkirim — cek layar/Notification Center");
    } catch (e) {
      toast.error(`Notifikasi lokal gagal: ${e instanceof Error ? e.message : "?"} — kemungkinan diblokir OS (macOS: System Settings → Notifications → izinkan ${browser?.name ?? "browser"})`);
    }
  };

  if (!checked || !browser) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Memeriksa status push...
      </div>
    );
  }

  if (!supported) {
    const iosHint = browser.isIOS
      ? " Di iOS: Web Push hanya jalan via Safari + Add to Home Screen (PWA)."
      : "";
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-muted-foreground">
        <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
        Browser/device ini tidak mendukung Web Push. Gunakan Chrome/Brave/Safari/Edge/Firefox terbaru.{iosHint}
      </div>
    );
  }

  const diagItems: { label: string; ok: boolean | null; note: string }[] = [
    {
      label: `Browser: ${browser.name}`,
      ok: browser.isBrave ? fcmOk : true,
      note: browser.isBrave
        ? "Brave butuh setting “Use Google services for push messaging” ON (brave://settings/privacy)"
        : "Terdeteksi",
    },
    {
      label: `Izin browser: ${perm}`,
      ok: perm === "granted",
      note: perm === "granted" ? "Sudah diizinkan" : perm === "denied" ? "Ditolak — reset via ikon site di address bar" : "Belum diminta",
    },
    {
      label: "Service worker: aktif",
      ok: true,
      note: "sw.js ter-load",
    },
    {
      label: fcmOk === null ? "Koneksi push service: mengecek..." : fcmOk ? "Koneksi push service (FCM): OK" : "Koneksi push service (FCM): TERBLOKIR",
      ok: fcmOk,
      note: fcmOk === false ? "Jaringan/Shields memblokir fcm.googleapis.com — coba matikan Shields atau ganti jaringan" : "Google push server reachable",
    },
  ];

  return (
    <div className="space-y-3">
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
        <div className="flex flex-col gap-1.5">
          <button
            onClick={enabled ? disable : enable}
            disabled={busy}
            className={
              enabled
                ? "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                : "inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            {enabled ? "Matikan" : "Aktifkan"}
          </button>
          <button
            onClick={testLocal}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Zap className="h-3.5 w-3.5" /> Tes notifikasi lokal
          </button>
        </div>
      </div>

      {/* Panel diagnostik */}
      {!enabled && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" /> Diagnostik push
          </p>
          <ul className="space-y-1.5">
            {diagItems.map((d) => (
              <li key={d.label} className="flex items-start gap-2 text-xs">
                {d.ok === null ? (
                  <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : d.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span className="text-foreground/90">{d.label}</span>
                <span className="text-muted-foreground">— {d.note}</span>
              </li>
            ))}
          </ul>
          {browser.isBrave && (
            <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
              Tips Brave: (1) buka <code className="rounded bg-muted px-1">brave://settings/privacy</code> → aktifkan <strong>Use Google services for push messaging</strong>; (2) klik ikon singa di address bar → atur Shields ke <strong>Shields down</strong> untuk situs ini; lalu reload & coba lagi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}