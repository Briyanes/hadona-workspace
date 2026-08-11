"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock, User, CheckCircle2, XCircle } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<{ [k: string]: string | undefined }>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // ─── Validators ───
  const validateName = (v: string) => {
    if (!v.trim()) return "Nama wajib diisi";
    if (v.trim().length < 2) return "Nama minimal 2 karakter";
    return undefined;
  };
  const validateEmail = (v: string) => {
    if (!v) return "Email wajib diisi";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Format email tidak valid";
    return undefined;
  };
  const validatePassword = (v: string) => {
    if (!v) return "Password wajib diisi";
    if (v.length < 6) return "Password minimal 6 karakter";
    return undefined;
  };
  const validateConfirm = (v: string) => {
    if (!v) return "Konfirmasi password wajib diisi";
    if (v !== password) return "Password tidak cocok";
    return undefined;
  };

  // ─── Password Strength ───
  const getPasswordStrength = (pw: string): { score: number; label: string; color: string } => {
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
      { label: "Terlalu pendek", color: "bg-muted" },
      { label: "Lemah", color: "bg-danger" },
      { label: "Cukup", color: "bg-warning" },
      { label: "Baik", color: "bg-info" },
      { label: "Kuat", color: "bg-success" },
      { label: "Sangat Kuat", color: "bg-success" },
    ];
    return { score, ...levels[score] };
  };

  const strength = getPasswordStrength(password);

  // ─── Change handlers with live validation ───
  const handleChange = (field: string, val: string, validator: (v: string) => string | undefined) => {
    const setters: Record<string, (v: string) => void> = {
      fullName: setFullName,
      email: setEmail,
      password: setPassword,
      confirmPassword: setConfirmPassword,
    };
    setters[field]?.(val);
    if (errors[field]) setErrors((p) => ({ ...p, [field]: validator(val) }));
    // Re-validate confirm when password changes
    if (field === "password" && confirmPassword) {
      setErrors((p) => ({ ...p, confirmPassword: validateConfirm(confirmPassword) }));
    }
  };

  const isFormValid = () =>
    !validateName(fullName) &&
    !validateEmail(email) &&
    !validatePassword(password) &&
    !validateConfirm(confirmPassword);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors = {
      fullName: validateName(fullName),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirm(confirmPassword),
    };
    setErrors(newErrors);
    if (Object.values(newErrors).some(Boolean)) return;

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      let msg = error.message;
      if (msg.includes("already registered")) msg = "Email sudah terdaftar. Silakan login.";
      else if (msg.includes("weak")) msg = "Password terlalu lemah. Gunakan kombinasi yang lebih kuat.";
      toast.error("Pendaftaran gagal: " + msg);
      setLoading(false);
      return;
    }

    if (data.user && !data.session) {
      toast.success("Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi.");
      setLoading(false);
      router.push("/login");
      return;
    }

    toast.success(`Selamat datang, ${fullName}! Akun Anda telah dibuat.`);
    router.push("/");
    router.refresh();
  };

  const handleGoogleSignup = async () => {
    setGoogleLoading(true);
    const redirectTo = `${window.location.origin}/auth/callback?redirect=/`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      toast.error("Google signup gagal: " + error.message);
      setGoogleLoading(false);
    }
  };

  // ─── Reusable input class with error state ───
  const inputClass = (field: string) =>
    `input pl-9 pr-9 ${errors[field] ? "border-danger focus:border-danger focus:ring-danger/20" : ""}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-dark px-4 py-8">
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-hadona-yellow/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-light/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface p-2 shadow-lg shadow-black/10">
            <Image src="/logo/logo-hadona.png" alt="Hadona Digital Media" width={48} height={48} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-white">Buat Akun Baru</h1>
          <p className="mt-1 text-sm text-white/70">Hadona Digital Media Team</p>
        </div>

        <div className="rounded-2xl bg-surface p-8 shadow-2xl shadow-black/20">
          <form onSubmit={handleSignup} className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-foreground">Nama Lengkap</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="fullName"
                  type="text"
                  required
                  ref={nameRef}
                  value={fullName}
                  onChange={(e) => handleChange("fullName", e.target.value, validateName)}
                  onBlur={() => setErrors((p) => ({ ...p, fullName: validateName(fullName) }))}
                  placeholder="John Doe"
                  aria-invalid={!!errors.fullName}
                  aria-describedby={errors.fullName ? "name-error" : undefined}
                  className={inputClass("fullName")}
                />
              </div>
              {errors.fullName && <p id="name-error" className="mt-1 text-xs text-danger" role="alert">{errors.fullName}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => handleChange("email", e.target.value, validateEmail)}
                  onBlur={() => setErrors((p) => ({ ...p, email: validateEmail(email) }))}
                  placeholder="nama@hadona.id"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "signup-email-error" : undefined}
                  className={inputClass("email")}
                />
              </div>
              {errors.email && <p id="signup-email-error" className="mt-1 text-xs text-danger" role="alert">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => handleChange("password", e.target.value, validatePassword)}
                  onBlur={() => setErrors((p) => ({ ...p, password: validatePassword(password) }))}
                  placeholder="Minimal 6 karakter"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "signup-pw-error" : undefined}
                  className={inputClass("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Password strength bar */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.color : "bg-border"}`}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted">Kekuatan: {strength.label}</p>
                </div>
              )}
              {errors.password && <p id="signup-pw-error" className="mt-1 text-xs text-danger" role="alert">{errors.password}</p>}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-foreground">Konfirmasi Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => handleChange("confirmPassword", e.target.value, validateConfirm)}
                  onBlur={() => setErrors((p) => ({ ...p, confirmPassword: validateConfirm(confirmPassword) }))}
                  placeholder="••••••••"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? "confirm-error" : confirmPassword && !errors.confirmPassword ? "confirm-ok" : undefined}
                  className={inputClass("confirmPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-muted"
                  aria-label={showConfirm ? "Sembunyikan password" : "Tampilkan password"}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {/* Match indicator */}
                {confirmPassword && !errors.confirmPassword && (
                  <CheckCircle2 className="absolute right-9 top-1/2 -translate-y-1/2 text-success" size={16} aria-hidden />
                )}
                {confirmPassword && errors.confirmPassword && (
                  <XCircle className="absolute right-9 top-1/2 -translate-y-1/2 text-danger" size={16} aria-hidden />
                )}
              </div>
              {errors.confirmPassword ? (
                <p id="confirm-error" className="mt-1 text-xs text-danger" role="alert">{errors.confirmPassword}</p>
              ) : confirmPassword ? (
                <p id="confirm-ok" className="mt-1 text-xs text-success">Password cocok</p>
              ) : null}
            </div>

            <button type="submit" disabled={loading || !isFormValid()} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Memproses...
                </span>
              ) : "Daftar"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">atau</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={handleGoogleSignup}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface disabled:opacity-50"
          >
            {googleLoading ? (
              <span className="text-xs">Mengarahkan ke Google...</span>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Daftar dengan Google
              </>
            )}
          </button>

          <p className="mt-5 text-center text-sm text-muted">
            Sudah punya akun?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">Masuk di sini</Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          Dengan mendaftar, Anda akan mendapat role default sebagai "Advertiser". Manager dapat mengubah role Anda setelah login.
        </p>
      </div>
    </div>
  );
}