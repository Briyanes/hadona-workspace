"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shield, Key, Monitor, Smartphone, Globe, CheckCircle2, AlertCircle, Lock, Copy } from "lucide-react";

export default function SecuritySettingsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ user: { app_metadata: { provider?: string }; created_at: string } } | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupSecret, setSetupSecret] = useState("");
  const [setupQrUrl, setSetupQrUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disableToken, setDisableToken] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session as unknown as { user: { app_metadata: { provider?: string }; created_at: string } } | null);
      // Load 2FA status
      try {
        const res = await fetch("/api/auth/2fa");
        if (res.ok) {
          const data2fa = await res.json();
          setTwoFactorEnabled(data2fa.enabled);
        }
      } catch {}
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

  // === 2FA Handlers ===
  const handle2FASetup = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSetupSecret(data.secret);
      setSetupQrUrl(data.qrUrl);
      setShowSetupModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memulai setup 2FA");
    }
    setTwoFactorLoading(false);
  };

  const handle2FAVerify = async () => {
    if (!totpCode || totpCode.length !== 6) {
      toast.error("Masukkan kode 6 digit dari authenticator app");
      return;
    }
    setTwoFactorLoading(true);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token: totpCode, secret: setupSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes);
      setShowBackupCodes(true);
      setTwoFactorEnabled(true);
      toast.success("2FA berhasil diaktifkan!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verifikasi gagal");
    }
    setTwoFactorLoading(false);
  };

  const handle2FADisable = async () => {
    if (!disableToken || disableToken.length !== 6) {
      toast.error("Masukkan kode 6 digit untuk konfirmasi");
      return;
    }
    setTwoFactorLoading(true);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable", token: disableToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFactorEnabled(false);
      setDisableToken("");
      toast.success("2FA dinonaktifkan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menonaktifkan 2FA");
    }
    setTwoFactorLoading(false);
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
        <h3 className="mb-4 text-sm font-semibold text-foreground">Authentication Method</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface shadow-sm border border-border">
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
                <p className="text-sm font-medium text-foreground">
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
            <span className="font-medium text-foreground">{accountCreated}</span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Change Password</h3>
        {isGoogleAuth ? (
          <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
            <Shield size={16} className="mt-0.5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Password dikelola Google</p>
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
        <h3 className="mb-4 text-sm font-semibold text-foreground">Session Info</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Monitor size={14} className="text-muted" />
              <span className="text-foreground">Current Device</span>
            </div>
            <span className="text-xs text-success">Active Now</span>
          </div>
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-muted" />
              <span className="text-foreground">Browser Session</span>
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

      {/* Two-Factor Authentication (2FA) */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Two-Factor Authentication</h3>
          {twoFactorEnabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <CheckCircle2 size={12} /> Active
            </span>
          )}
        </div>

        {!twoFactorEnabled ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
              <Lock size={16} className="mt-0.5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Lindungi akun Anda dengan 2FA</p>
                <p className="text-xs text-muted">
                  Gunakan Google Authenticator, Authy, atau 1Password. Setiap login akan memerlukan kode dari app.
                </p>
              </div>
            </div>
            <button
              onClick={handle2FASetup}
              disabled={twoFactorLoading}
              className="btn-primary px-4 py-2 text-sm"
            >
              {twoFactorLoading ? "Loading..." : "Aktifkan 2FA"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-success/5 p-4">
              <Shield size={16} className="mt-0.5 shrink-0 text-success" />
              <div className="text-sm">
                <p className="font-medium text-foreground">2FA Aktif</p>
                <p className="text-xs text-muted">
                  Akun Anda dilindungi dengan TOTP. Setiap login memerlukan kode dari authenticator app.
                </p>
              </div>
            </div>

            {/* Disable 2FA */}
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted">Nonaktifkan 2FA (memerlukan kode verifikasi)</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={disableToken}
                  onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  className="input flex-1"
                  maxLength={6}
                />
                <button
                  onClick={handle2FADisable}
                  disabled={twoFactorLoading || disableToken.length !== 6}
                  className="btn-danger px-4 py-2 text-sm"
                >
                  Disable
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2FA Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSetupModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-bold text-foreground">Setup 2FA</h3>

            {!showBackupCodes ? (
              <div className="space-y-4">
                <p className="text-sm text-muted">Scan QR code dengan authenticator app Anda:</p>
                <div className="flex justify-center">
                  <img src={setupQrUrl} alt="QR Code" className="h-48 w-48 rounded-lg border border-border" />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted">Atau masukkan manual:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-surface p-2 text-xs text-muted select-all">{setupSecret}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(setupSecret);
                        toast.success("Secret disalin");
                      }}
                      className="btn-secondary p-2"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Masukkan kode 6-digit dari app:</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="input text-center text-lg tracking-[0.5em]"
                    maxLength={6}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowSetupModal(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                  <button
                    onClick={handle2FAVerify}
                    disabled={twoFactorLoading || totpCode.length !== 6}
                    className="btn-primary flex-1 py-2 text-sm"
                  >
                    {twoFactorLoading ? "Verifying..." : "Verifikasi & Aktifkan"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-success/5 p-4">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">2FA Berhasil Diaktifkan!</p>
                    <p className="text-xs text-muted">Simpan backup codes berikut di tempat aman.</p>
                  </div>
                </div>
                <div className="rounded-lg bg-gray-900 p-4">
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, i) => (
                      <code key={i} className="text-center text-sm font-mono text-green-400">{code}</code>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Backup codes bisa digunakan jika Anda kehilangan akses ke authenticator app. Setiap code hanya bisa digunakan sekali.
                </p>
                <button
                  onClick={() => {
                    setShowSetupModal(false);
                    setShowBackupCodes(false);
                    setTotpCode("");
                  }}
                  className="btn-primary w-full py-2 text-sm"
                >
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
