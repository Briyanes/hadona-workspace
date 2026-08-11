"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, LogOut, Clock, Mail } from "lucide-react";
import Image from "next/image";

export default function WaitingApprovalPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [divisions, setDivisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "User");
      setUserEmail(user.email || "");

      // Load profile untuk dapat divisi yang dipilih
      const { data: profileRaw } = await supabase
        .from("profiles")
        .select("division, approval_status")
        .eq("id", user.id)
        .single();

      const profile = profileRaw as unknown as {
        division: string[] | null;
        approval_status: string | null;
      } | null;

      if (profile?.division) {
        setDivisions(profile.division);
      }

      // Jika sudah approved (misal admin cepat approve), langsung redirect ke dashboard
      if (profile?.approval_status === "approved") {
        router.push("/");
        return;
      }

      // Jika rejected, ke halaman rejected
      if (profile?.approval_status === "rejected") {
        router.push("/rejected");
        return;
      }

      setLoading(false);

      // === Realtime: listen untuk perubahan approval_status ===
      const channel = supabase
        .channel("approval-status-waiting")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const newRecord = payload.new as { approval_status: string };
            if (newRecord.approval_status === "approved") {
              router.push("/");
            } else if (newRecord.approval_status === "rejected") {
              router.push("/rejected");
            }
          }
        )
        .subscribe();

      // === Polling fallback: cek setiap 15 detik (kalau realtime tidak jalan) ===
      const pollInterval = setInterval(async () => {
        const { data: pollProfile } = await supabase
          .from("profiles")
          .select("approval_status")
          .eq("id", user.id)
          .single();

        const status = (pollProfile as unknown as { approval_status: string } | null)?.approval_status;
        if (status === "approved") {
          clearInterval(pollInterval);
          router.push("/");
        } else if (status === "rejected") {
          clearInterval(pollInterval);
          router.push("/rejected");
        }
      }, 15000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(pollInterval);
      };
    };

    const cleanupPromise = loadUser();
    return () => {
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary via-primary to-primary-dark">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-dark px-4 py-8">
      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-hadona-yellow/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-2xl bg-surface p-8 shadow-2xl shadow-black/20">
          {/* Logo + Animation */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 p-2">
              <Image
                src="/logo/logo-hadona.png"
                alt="Hadona Digital Media"
                width={48}
                height={48}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            {/* Pulsing clock icon */}
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Clock className="h-8 w-8 text-primary" />
                </div>
              </div>
            </div>

            <h1 className="text-xl font-bold text-foreground">
              Menunggu Persetujuan Admin
            </h1>
            <p className="mt-2 text-sm text-muted">
              Halo <span className="font-semibold text-foreground">{userName}</span>, permintaan akses
              Anda sedang ditinjau oleh Admin Hadona.
            </p>
          </div>

          {/* User Info Card */}
          <div className="mb-4 rounded-lg border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted" />
              <span className="font-medium text-foreground">{userEmail}</span>
            </div>
            <div className="border-t border-border pt-2">
              <p className="mb-2 text-xs font-medium text-muted">Divisi yang Dipilih:</p>
              <div className="flex flex-wrap gap-1.5">
                {divisions.length > 0 ? (
                  divisions.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">Tidak ada divisi dipilih</span>
                )}
              </div>
            </div>
          </div>

          {/* Status Info */}
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-muted">
              <span className="font-semibold">Status:</span> Permintaan Anda dalam antrian. Admin
              akan meninjau dan menyetujui akses Anda. Halaman ini akan otomatis berpindah ke
              Dashboard begitu Anda disetujui.
            </p>
          </div>

          {/* Auto-refresh indicator */}
          <div className="mb-4 flex items-center justify-center gap-2 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Memeriksa status otomatis setiap 15 detik...</span>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="btn-secondary flex w-full items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-white/50">
          Hadona Digital Media Workspace
        </p>
      </div>
    </div>
  );
}