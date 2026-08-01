"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Palette,
  PenTool,
  Video,
  KanbanSquare,
  Megaphone,
  Handshake,
  FileText,
  Code2,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const DIVISIONS: { value: string; label: string; desc: string; icon: LucideIcon }[] = [
  {
    value: "Creative Director",
    label: "Creative Director",
    desc: "Mengarahkan strategi kreatif & approve creative team",
    icon: Palette,
  },
  {
    value: "Content Creator",
    label: "Content Creator",
    desc: "Membuat konten, menerima task dari PM",
    icon: PenTool,
  },
  {
    value: "Production",
    label: "Production",
    desc: "Video shooting, editing, creative production",
    icon: Video,
  },
  {
    value: "Project Manager",
    label: "Project Manager",
    desc: "Membuat task, assign ke division, manage timeline",
    icon: KanbanSquare,
  },
  {
    value: "Advertiser",
    label: "Advertiser",
    desc: "Manage Meta/Google Ads, optimize ad spend",
    icon: Megaphone,
  },
  {
    value: "Account Executive",
    label: "Account Executive",
    desc: "Manage client relationship & strategy",
    icon: Handshake,
  },
  {
    value: "Copywriter",
    label: "Copywriter",
    desc: "Writing tasks, caption, script iklan",
    icon: FileText,
  },
  {
    value: "Developer",
    label: "Developer",
    desc: "Technical tasks, web development",
    icon: Code2,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");

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

      // If already has division, redirect to dashboard
      const { data: profileRaw } = await supabase
        .from("profiles")
        .select("division")
        .eq("id", user.id)
        .single();

      const profile = profileRaw as unknown as { division: string[] | null } | null;

      if (profile?.division && profile.division.length > 0) {
        router.push("/");
      }
    };
    loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDivision(value: string) {
    setSelectedDivisions((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]
    );
  }

  const handleSave = async () => {
    if (selectedDivisions.length === 0) {
      toast.error("Silakan pilih minimal 1 divisi");
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Sesi tidak valid, silakan login kembali");
      router.push("/login");
      return;
    }

    // Upsert profile with selected divisions (array)
    // Note: role is omitted — DB trigger already set it to 'advertiser' default
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email || "",
      full_name: user.user_metadata?.full_name || userName,
      division: selectedDivisions,
      avatar_url: user.user_metadata?.avatar_url || null,
      is_active: true,
    } as never, {
      onConflict: "id",
    });

    if (error) {
      toast.error("Gagal menyimpan divisi: " + error.message);
      setSaving(false);
      return;
    }

    toast.success(`Selamat datang! Anda terdaftar di ${selectedDivisions.length} divisi`);
    setSaving(false);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary via-primary to-primary-dark px-4 py-8">
      {/* Decorative shapes */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-hadona-yellow/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-light/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Header */}
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
          <h1 className="text-2xl font-bold text-white">Selamat Datang di Hadona!</h1>
          <p className="mt-1 text-sm text-white/70">
            Hai <span className="font-medium text-white">{userName}</span> ({userEmail}),
            <br />
            pilih divisi Anda untuk mulai berkontribusi
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            Anda bisa memilih lebih dari 1 divisi
          </p>
        </div>

        {/* Onboarding Card */}
        <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          {/* Division Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DIVISIONS.map((div) => {
              const isSelected = selectedDivisions.includes(div.value);
              return (
                <button
                  key={div.value}
                  onClick={() => toggleDivision(div.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border bg-surface hover:border-primary/40 hover:bg-primary/5"
                  )}
                >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background">
                  <div.icon size={20} className="text-primary" />
                </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{div.label}</span>
                      {isSelected && (
                        <Check size={14} className="text-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{div.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Info note */}
          {/* Selected counter */}
          {selectedDivisions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {selectedDivisions.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <Check size={12} />
                  {d}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface p-3">
            <Lightbulb size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-muted">
              <span className="font-medium">Catatan:</span> Divisi menentukan scope task yang akan
              Anda terima. Project Manager dapat assign task spesifik ke divisi Anda. Admin dapat
              mengubah divisi Anda kapan saja melalui User Management.
            </p>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSave}
            disabled={selectedDivisions.length === 0 || saving}
            className="btn-primary mt-5 flex w-full items-center justify-center gap-2"
          >
            {saving ? (
              "Menyimpan..."
            ) : (
              <>
                {selectedDivisions.length > 0
                  ? `Mulai (${selectedDivisions.length} Divisi Terpilih)`
                  : "Pilih minimal 1 divisi"}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}