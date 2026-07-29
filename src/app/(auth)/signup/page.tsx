"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Password dan konfirmasi password tidak cocok");
      return;
    }

    if (password.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      toast.error("Pendaftaran gagal: " + error.message);
      setLoading(false);
      return;
    }

    // Jika email confirmation diaktifkan di Supabase
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-xl font-bold text-white">
            H
          </div>
          <h1 className="text-2xl font-bold text-white">Buat Akun Baru</h1>
          <p className="mt-1 text-sm text-muted">Hadona Digital Media Team</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">Nama Lengkap</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@hadona.id"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">Konfirmasi Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Loading..." : "Daftar"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Masuk di sini
          </Link>
        </p>

        <p className="text-center text-xs text-muted">
          Dengan mendaftar, Anda akan mendapat role default sebagai "Advertiser".
          Manager dapat mengubah role Anda setelah login.
        </p>
      </div>
    </div>
  );
}