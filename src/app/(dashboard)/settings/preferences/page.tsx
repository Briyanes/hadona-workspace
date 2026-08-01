"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, Sun, Moon, Globe, Clock } from "lucide-react";
import type { UserPreferences } from "@/types";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  { value: "Asia/Jakarta", label: "Jakarta (WIB, UTC+7)" },
  { value: "Asia/Makassar", label: "Makassar (WITA, UTC+8)" },
  { value: "Asia/Jayapura", label: "Jayapura (WIT, UTC+9)" },
  { value: "Asia/Singapore", label: "Singapore (SGT, UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST, UTC+9)" },
  { value: "America/New_York", label: "New York (EST, UTC-5)" },
  { value: "Europe/London", label: "London (GMT, UTC+0)" },
];

export default function PreferencesSettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>({
    theme: "light",
    language: "id",
    timezone: "Asia/Jakarta",
  });

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase.from("profiles").select("preferences").eq("id", user.id).single();
    const prefsData = data as unknown as { preferences?: UserPreferences };
    if (prefsData?.preferences) {
      setPrefs(prefsData.preferences);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ preferences: prefs } as never).eq("id", userId);
    if (error) toast.error("Failed: " + error.message);
    else toast.success("Preferences saved");
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <Sun size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">Theme</h3>
        </div>
        <p className="mb-4 text-xs text-muted">Pilih tampilan yang Anda sukai.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Globe },
          ].map((opt) => {
            const Icon = opt.icon;
            const isActive = prefs.theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPrefs({ ...prefs, theme: opt.value as UserPreferences["theme"] })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                  isActive ? "border-primary bg-primary/5 text-primary" : "border-border text-muted hover:border-muted"
                )}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Language */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <Globe size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">Language</h3>
        </div>
        <p className="mb-4 text-xs text-muted">Bahasa yang digunakan di aplikasi.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
            { value: "en", label: "English", flag: "🇬🇧" },
          ].map((opt) => {
            const isActive = prefs.language === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPrefs({ ...prefs, language: opt.value as UserPreferences["language"] })}
                className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                  isActive ? "border-primary bg-primary/5 text-primary" : "border-border text-muted hover:border-muted"
                )}
              >
                <span className="text-lg">{opt.flag}</span>
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timezone */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-gray-900">Timezone</h3>
        </div>
        <p className="mb-4 text-xs text-muted">Zona waktu untuk jadwal dan notifikasi.</p>
        <select
          value={prefs.timezone}
          onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
          className="input"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
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