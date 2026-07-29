"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error("Login gagal: " + error.message);
      setLoading(false);
      return;
    }

    toast.success("Selamat datang kembali!");
    const redirect = searchParams.get("redirect") || "/";
    router.push(redirect);
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl gradient-primary text-xl font-bold text-white">
            H
          </div>
          <h1 className="text-2xl font-bold text-white">Hadona Workspace</h1>
          <p className="mt-1 text-sm text-muted">Agency Operating System</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Loading..." : "Masuk"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Belum punya akun?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Daftar di sini
          </Link>
        </p>

        <p className="text-center text-xs text-muted">
          Hanya untuk tim internal Hadona Digital Media.
        </p>
      </div>
    </div>
  );
}