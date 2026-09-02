"use client";

import { Clock, Construction, Globe, Loader2, Moon, Save, Sparkles, Sun } from 'lucide-react';
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

import type { UserPreferences } from "@/types";
import { useTheme } from "@/components/theme-provider";
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
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setLoadingPrefs] = useState(false);
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

  // Live theme toggle: apply immediately when user clicks
  const handleThemeChange = async (newTheme: "light" | "dark" | "system") => {
    setPrefs({ ...prefs, theme: newTheme });
    setTheme(newTheme); // This applies immediately + saves to DB
    toast.success(`Theme changed to ${newTheme}`);
  };

  const handleSave = async () => {
    if (!userId) return;
    setLoadingPrefs(true);
    const { error } = await supabase.from("profiles").update({ preferences: prefs } as never).eq("id", userId);
    if (error) toast.error("Failed: " + error.message);
    else toast.success("Preferences saved");
    setLoadingPrefs(false);
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
          <h3 className="text-sm font-semibold text-foreground">Theme</h3>
          <span className="badge bg-success/10 text-success text-[10px]">Live</span>
        </div>
        <p className="mb-4 text-xs text-muted">Pilih tampilan yang Anda sukai. Perubahan langsung aktif.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Globe },
          ].map((opt) => {
            const Icon = opt.icon;
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleThemeChange(opt.value as UserPreferences["theme"])}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                  isActive
                    ? "border-primary bg-primary/5 text-primary shadow-sm scale-[1.02]"
                    : "border-border text-muted hover:border-muted hover:scale-[1.01]"
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
          <h3 className="text-sm font-semibold text-foreground">Language</h3>
          <span className="badge bg-warning/10 text-warning text-[10px]">Coming Soon</span>
        </div>
        <p className="mb-4 text-xs text-muted">Bahasa yang digunakan di aplikasi.</p>
        <div className="grid grid-cols-2 gap-3 opacity-60">
          {[
            { value: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
            { value: "en", label: "English", flag: "🇬🇧" },
          ].map((opt) => {
            const isActive = prefs.language === opt.value;
            return (
              <div
                key={opt.value}
                className={cn(
                  "flex cursor-not-allowed items-center gap-2 rounded-lg border p-3 text-sm",
                  isActive ? "border-primary bg-primary/5 text-primary" : "border-border text-muted"
                )}
              >
                <span className="text-lg">{opt.flag}</span>
                <span className="font-medium">{opt.label}</span>
                {isActive && <Sparkles size={12} className="ml-auto" />}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          <Construction size={12} className="inline" /> Dukungan multi-bahasa sedang dalam pengembangan dan akan tersedia segera.
        </p>
      </div>

      {/* Timezone */}
      <div className="card p-6">
        <div className="mb-1 flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Timezone</h3>
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