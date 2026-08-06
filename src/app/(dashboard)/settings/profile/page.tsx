"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Save, Upload, Linkedin, Instagram, Globe, Phone, User } from "lucide-react";
import type { Profile } from "@/types";
import { cn } from "@/lib/utils";

const DIVISIONS = [
  "Creative Director",
  "Content Creator",
  "Production",
  "Project Manager",
  "Advertiser",
  "Account Executive",
  "Copywriter",
  "Developer",
] as const;

const DIVISION_COLORS: Record<string, string> = {
  "Creative Director": "bg-primary/15 text-primary",
  "Content Creator": "bg-success/15 text-success",
  Production: "bg-warning/15 text-warning",
  "Project Manager": "bg-accent/15 text-accent",
  Advertiser: "bg-danger/15 text-danger",
  "Account Executive": "bg-muted/20 text-muted",
  Copywriter: "bg-primary/15 text-primary",
  Developer: "bg-success/15 text-success",
};

export default function ProfileSettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [divisions, setDivisions] = useState<string[]>([]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (data) {
      const p = data as unknown as Profile;
      setProfile(p);
      setFullName(p.full_name || "");
      setPhone(p.phone || "");
      setBio(p.bio || "");
      setLinkedinUrl(p.linkedin_url || "");
      setInstagramUrl(p.instagram_url || "");
      setPortfolioUrl(p.portfolio_url || "");
      setAvatarUrl(p.avatar_url || null);
      setDivisions(Array.isArray(p.division) ? (p.division as unknown as string[]) : []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const toggleDivision = (div: string) => {
    setDivisions((prev) => prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div]);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${userId}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("uploads").getPublicUrl(path);
      setAvatarUrl(publicUrl);
      const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: publicUrl } as never).eq("id", userId);
      if (updateErr) throw updateErr;
      toast.success("Avatar updated");
    } catch (err) {
      toast.error("Upload failed: " + (err instanceof Error ? err.message : "Unknown"));
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName,
      phone,
      bio,
      linkedin_url: linkedinUrl,
      instagram_url: instagramUrl,
      portfolio_url: portfolioUrl,
      division: divisions.length > 0 ? divisions : null,
    } as never).eq("id", userId);
    if (error) toast.error("Failed: " + error.message);
    else toast.success("Profile saved");
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Avatar & Basic Info */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Avatar & Identity</h3>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-border" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">
                  {fullName?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            <label className="cursor-pointer text-xs text-primary hover:underline">
              {uploading ? "Uploading..." : "Change Avatar"}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Full Name</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pl-9" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Email (read-only)</label>
              <input value={profile?.email || ""} disabled className="input bg-surface text-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Contact & Bio */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Contact & Bio</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" className="input pl-9" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Tell us about yourself..." className="input resize-none" />
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Social Links</h3>
        <div className="grid gap-4 sm:grid-cols-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">LinkedIn</label>
            <div className="relative">
              <Linkedin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/..." className="input pl-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Instagram</label>
            <div className="relative">
              <Instagram size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/..." className="input pl-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Portfolio</label>
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://..." className="input pl-9" />
            </div>
          </div>
        </div>
      </div>

      {/* Divisions */}
      <div className="card p-6">
        <h3 className="mb-1 text-sm font-semibold text-gray-900">Divisions</h3>
        <p className="mb-3 text-xs text-muted">Select divisi yang Anda jalani. Admin dapat mengubah ini juga.</p>
        <div className="flex flex-wrap gap-2">
          {DIVISIONS.map((d) => {
            const checked = divisions.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDivision(d)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  checked ? DIVISION_COLORS[d] || "bg-primary/15 text-primary" : "bg-muted/10 text-muted hover:bg-muted/20"
                )}
              >
                {checked ? "✓ " : ""}{d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-6 py-2 text-sm">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}