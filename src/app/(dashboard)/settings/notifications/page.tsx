"use client";

import { Bell, CheckCircle2, Loader2, MessageSquare, Save, Send } from 'lucide-react';
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

import type { NotificationPrefs } from "@/types";
import { Toggle } from "@/components/ui/toggle";
import { PushManager } from "@/components/settings/push-manager";

export default function NotificationsSettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    email_task: true,
    email_report: true,
    email_daily: false,
    email_weekly: false,
    push_chat: true,
    push_task: true,
    telegram_enabled: false,
    telegram_webhook: null,
  });

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase.from("profiles").select("notification_prefs").eq("id", user.id).single();
    const prefsData = data as unknown as { notification_prefs?: NotificationPrefs };
    if (prefsData?.notification_prefs) {
      setPrefs(prefsData.notification_prefs);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ notification_prefs: prefs } as never).eq("id", userId);
    if (error) toast.error("Failed: " + error.message);
    else toast.success("Notification preferences saved");
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-lg border border-success/30 bg-success/5 p-4">
        <div className="flex items-start gap-2">
          <span className="badge bg-success/15 text-success shrink-0 text-[10px]">Active</span>
          <p className="text-xs text-muted">
            <CheckCircle2 size={12} className="inline" /> <strong>In-app notifications</strong> aktif (<Bell size={12} className="inline" /> di header) · <strong>Email digest</strong> aktif (Daily 07:00 & Weekly Senin via cron) · Telegram webhook coming soon.
          </p>
        </div>
      </div>

      {/* Push Notification (per-device opt-in) */}
      <div className="card p-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Push Notification</h3>
        <p className="mb-3 text-xs text-muted">Aktifkan push di setiap device (browser/HP) yang Anda pakai.</p>
        <PushManager />
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium text-muted">Jenis push yang ingin diterima (berlaku ke semua device):</p>
          <Toggle
            showRow
            checked={prefs.push_chat !== false}
            onChange={() => setPrefs({ ...prefs, push_chat: prefs.push_chat === false })}
            label="Chat & Mention"
            description="Push saat ada pesan chat atau Anda di-mention"
            icon={MessageSquare}
          />
          <Toggle
            showRow
            checked={prefs.push_task !== false}
            onChange={() => setPrefs({ ...prefs, push_task: prefs.push_task === false })}
            label="Task Assignment"
            description="Push saat ada task baru yang ditugaskan ke Anda"
            icon={Bell}
          />
        </div>
      </div>

      {/* Email Notifications */}
      <div className="card p-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Email Notifications</h3>
        <p className="mb-2 text-xs text-muted">Atur email apa yang ingin Anda terima.</p>
        <Toggle
          showRow
          checked={prefs.email_task}
          onChange={() => setPrefs({ ...prefs, email_task: !prefs.email_task })}
          label="Task Assignment"
          description="Email saat ada task baru yang ditugaskan ke Anda"
          icon={Bell}
        />
        <Toggle
          showRow
          checked={prefs.email_report}
          onChange={() => setPrefs({ ...prefs, email_report: !prefs.email_report })}
          label="Report Deadlines"
          description="Pengingat H-1 sebelum report weekly deadline"
          icon={Send}
        />
        <Toggle
          showRow
          checked={prefs.email_daily}
          onChange={() => setPrefs({ ...prefs, email_daily: !prefs.email_daily })}
          label="Daily Summary"
          description="Ringkasan tugas & deadline setiap pagi (07:00 WIB)"
          icon={Bell}
        />
        <Toggle
          showRow
          checked={prefs.email_weekly}
          onChange={() => setPrefs({ ...prefs, email_weekly: !prefs.email_weekly })}
          label="Weekly Summary"
          description="Ringkasan aktivitas tim setiap Senin pagi"
          icon={MessageSquare}
        />
      </div>

      {/* Telegram Integration */}
      <div className="card p-6">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Telegram Integration</h3>
        <p className="mb-2 text-xs text-muted">Hubungkan bot Telegram untuk notifikasi real-time.</p>
        <Toggle
          showRow
          checked={prefs.telegram_enabled}
          onChange={() => setPrefs({ ...prefs, telegram_enabled: !prefs.telegram_enabled })}
          label="Enable Telegram"
          description="Kirim notifikasi ke Telegram webhook"
          icon={MessageSquare}
        />
        {prefs.telegram_enabled && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Telegram Webhook URL</label>
            <input
              value={prefs.telegram_webhook || ""}
              onChange={(e) => setPrefs({ ...prefs, telegram_webhook: e.target.value })}
              placeholder="https://api.telegram.org/bot.../sendMessage"
              className="input"
            />
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-6 py-2 text-sm">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}