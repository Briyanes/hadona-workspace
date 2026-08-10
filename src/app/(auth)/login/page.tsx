"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus email field on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validateEmail = (val: string) => {
    if (!val) return "Email wajib diisi";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return "Format email tidak valid";
    return undefined;
  };

  const validatePassword = (val: string) => {
    if (!val) return "Password wajib diisi";
    if (val.length < 6) return "Password minimal 6 karakter";
    return undefined;
  };

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (errors.email) setErrors((p) => ({ ...p, email: validateEmail(val) }));
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    if (errors.password) setErrors((p) => ({ ...p, password: validatePassword(val) }));
  };

  const isFormValid = () => !validateEmail(email) && !validatePassword(password);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setErrors({ email: emailErr, password: passwordErr });
    if (emailErr || passwordErr) return;

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // User-friendly error messages
      let msg = error.message;
      if (msg.includes("Invalid login credentials")) msg = "Email atau password salah";
      else if (msg.includes("Email not confirmed")) msg = "Email belum dikonfirmasi. Hubungi admin.";
      else if (msg.includes("rate limit") || msg.includes("too many")) msg = "Terlalu banyak percobaan. Coba lagi nanti.";

      toast.error("Login gagal: " + msg);
      setLoading(false);
      return;
    }

    toast.success("Selamat datang kembali!");
    const redirect = searchParams.get("redirect") || "/";
    router.push(redirect);
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const redirect = searchParams.get("redirect") || "/";
    const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      toast.error("Google login gagal: " + error.message);
      setGoogleLoading(false);
    }
    // If success, browser will redirect to Google → callback
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-dark px-4 py-8">
      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-hadona-yellow/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-light/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo & Title */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-black/10">
            <Image
              src="/logo/logo-hadona.png"
              alt="Hadona Digital Media"
              width={48}
              height={48}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Hadona Workspace</h1>
          <p className="mt-1 text-sm text-white/70">Agency Operating System</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl shadow-black/20">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-900">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="email"
                  type="email"
                  required
                  ref={emailRef}
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={() => setErrors((p) => ({ ...p, email: validateEmail(email) }))}
                  placeholder="nama@hadona.id"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`input pl-9 ${errors.email ? "border-danger focus:border-danger focus:ring-danger/20" : ""}`}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="mt-1 text-xs text-danger" role="alert">
                  {errors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-900">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  onBlur={() => setErrors((p) => ({ ...p, password: validatePassword(password) }))}
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "pw-error" : undefined}
                  className={`input pl-9 pr-9 ${errors.password ? "border-danger focus:border-danger focus:ring-danger/20" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p id="pw-error" className="mt-1 text-xs text-danger" role="alert">
                  {errors.password}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading || !isFormValid()} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Memproses...
                </span>
              ) : (
                "Masuk"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">atau</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-surface disabled:opacity-50"
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
                Masuk dengan Google
              </>
            )}
          </button>

          <p className="mt-5 text-center text-sm text-muted">
            Belum punya akun?{" "}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              Daftar di sini
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          Hanya untuk tim internal Hadona Digital Media.
        </p>
      </div>
    </div>
  );
}