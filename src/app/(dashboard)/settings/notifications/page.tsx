"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, Bell, Send, MessageSquare } from "lucide-react";
import type { NotificationPrefs } from "@/types";
import { cn } from "@/lib/utils";

export default function NotificationsSettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    email_task: true,
    email_report: true,
    email_weekly: false,
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

  const Toggle = ({ checked, onChange, label, description, icon: Icon }: {
    checked: boolean;
    onChange: () => void;
    label: string;
    description: string;
    icon: React.ElementType;
  }) => (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg", checked ? "bg-primary/15 text-primary" : "bg-muted/10 text-muted")}>
          <Icon size={16} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted/30"
        )}
      >
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-2">
          <span className="badge bg-success/15 text-success shrink-0 text-[10px]">In-App Active</span>
          <p className="text-xs text-muted">
            ✅ <strong>In-app notifications</strong> sudah aktif — klik ikon 🔔 di header untuk melihat update task & assignment. Email & Telegram auto-delivery sedang dalam pengembangan dan akan segera aktif.
          </p>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="card p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Email Notifications</h3>
        <p className="mb-2 text-xs text-muted">Atur email apa yang ingin Anda terima.</p>
        <Toggle
          checked={prefs.email_task}
          onChange={() => setPrefs({ ...prefs, email_task: !prefs.email_task })}
          label="Task Assignment"
          description="Email saat ada task baru yang ditugaskan ke Anda"
          icon={Bell}
        />
        <Toggle
          checked={prefs.email_report}
          onChange={() => setPrefs({ ...prefs, email_report: !prefs.email_report })}
          label="Report Deadlines"
          description="Pengingat H-1 sebelum report weekly deadline"
          icon={Send}
        />
        <Toggle
          checked={prefs.email_weekly}
          onChange={() => setPrefs({ ...prefs, email_weekly: !prefs.email_weekly })}
          label="Weekly Summary"
          description="Ringkasan aktivitas tim setiap Senin pagi"
          icon={MessageSquare}
        />
      </div>

      {/* Telegram Integration */}
      <div className="card p-6">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Telegram Integration</h3>
        <p className="mb-2 text-xs text-muted">Hubungkan bot Telegram untuk notifikasi real-time.</p>
        <Toggle
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