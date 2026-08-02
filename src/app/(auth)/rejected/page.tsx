"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Loader2, LogOut, XCircle, RotateCcw, Mail } from "lucide-react";
import Image from "next/image";

export default function RejectedPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
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

      const { data: profileRaw } = await supabase
        .from("profiles")
        .select("division, approval_status, rejection_reason")
        .eq("id", user.id)
        .single();

      const profile = profileRaw as unknown as {
        division: string[] | null;
        approval_status: string | null;
        rejection_reason: string | null;
      } | null;

      if (profile?.rejection_reason) {
        setRejectionReason(profile.rejection_reason);
      }

      // Jika ternyata sudah approved (misal admin berubah pikiran), redirect
      if (profile?.approval_status === "approved") {
        router.push("/");
        return;
      }

      setLoading(false);
    };

    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReapply() {
    // Reset status ke pending_onboarding supaya user bisa pilih divisi lagi
    const { error } = await supabase
      .from("profiles")
      .update({
        approval_status: "pending_onboarding",
        division: null,
        rejection_reason: null,
      } as never)
      .eq(
        "id",
        (await supabase.auth.getUser()).data.user?.id || ""
      );

    if (error) {
      console.error("Failed to reset:", error.message);
      return;
    }

    router.push("/onboarding");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-danger via-danger to-red-700">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-danger via-danger to-red-700 px-4 py-8">
      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-2xl bg-white p-8 shadow-2xl shadow-black/20">
          {/* Logo + Icon */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/5 p-2">
              <Image
                src="/logo/logo-hadona.png"
                alt="Hadona Digital Media"
                width={48}
                height={48}
                className="h-full w-full object-contain"
                priority
              />
            </div>

            {/* Rejected icon */}
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
                <XCircle className="h-8 w-8 text-danger" />
              </div>
            </div>

            <h1 className="text-xl font-bold text-gray-900">
              Akses Ditolak
            </h1>
            <p className="mt-2 text-sm text-muted">
              Halo <span className="font-semibold text-gray-900">{userName}</span>, mohon maaf,
              permintaan akses Anda belum dapat disetujui pada saat ini.
            </p>
          </div>

          {/* User Info */}
          <div className="mb-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted" />
              <span className="font-medium text-gray-900">{userEmail}</span>
            </div>
          </div>

          {/* Rejection Reason */}
          {rejectionReason && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-4">
              <p className="mb-1 text-xs font-semibold text-danger">Alasan Penolakan:</p>
              <p className="text-sm text-gray-700">{rejectionReason}</p>
            </div>
          )}

          {/* Info */}
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-info/30 bg-blue-50 p-3">
            <p className="text-xs text-gray-700">
              <span className="font-semibold">Butuh bantuan?</span> Hubungi Admin Hadona untuk
              informasi lebih lanjut atau ajukan ulang dengan divisi yang sesuai.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleReapply}
              className="btn-primary flex flex-1 items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Ajukan Ulang
            </button>
            <button
              onClick={handleLogout}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-white/50">
          Hadona Digital Media Workspace
        </p>
      </div>
    </div>
  );
}