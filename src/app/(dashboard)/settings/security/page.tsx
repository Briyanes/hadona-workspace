"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, Key, Monitor, Smartphone, Globe, CheckCircle2, AlertCircle } from "lucide-react";

export default function SecuritySettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ user: { app_metadata: { provider?: string }; created_at: string } } | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session as unknown as { user: { app_metadata: { provider?: string }; created_at: string } } | null);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Password baru dan konfirmasi tidak cocok");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error("Gagal: " + error.message);
    else {
      toast.success("Password berhasil diubah");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  if (loading) return <div className="py-12 text-center text-sm text-muted">Loading...</div>;

  const isGoogleAuth = session?.user?.app_metadata?.provider === "google";
  const accountCreated = session?.user?.created_at
    ? new Date(session.user.created_at).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })
    : "-";

  return (
    <div className="space-y-6">
      {/* Auth Provider */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Authentication Method</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm border border-border">
                {isGoogleAuth ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                ) : (
                  <Key size={16} className="text-muted" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {isGoogleAuth ? "Google Account" : "Email & Password"}
                </p>
                <p className="text-xs text-muted">
                  {isGoogleAuth ? "Login via Google OAuth" : "Login dengan email dan password"}
                </p>
              </div>
            </div>
            <CheckCircle2 size={16} className="text-success" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Account Created</span>
            <span className="font-medium text-gray-900">{accountCreated}</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Change Password</h3>
        {isGoogleAuth ? (
          <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
            <Shield size={16} className="mt-0.5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-gray-900">Password dikelola Google</p>
              <p className="text-xs text-muted">Karena Anda login via Google, password dikelola oleh akun Google Anda. Ubah password di Google Account settings.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword}
              className="btn-primary px-4 py-2 text-sm"
            >
              {changingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        )}
      </div>

      {/* Active Sessions Info */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Session Info</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Monitor size={14} className="text-muted" />
              <span className="text-gray-900">Current Device</span>
            </div>
            <span className="text-xs text-success">Active Now</span>
          </div>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-muted" />
              <span className="text-gray-900">Browser Session</span>
            </div>
            <span className="text-xs text-muted">This browser only</span>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-warning/5 p-3">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-muted">
              Untuk mengakhiri semua sesi lain, gunakan tombol Logout atau hubungi admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}