"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Search, PanelLeftClose, PanelLeftOpen, UserCircle2 } from "lucide-react";
import type { Profile } from "@/types";
import { useSidebar } from "@/components/ui/sidebar-context";
import { cn } from "@/lib/utils";

const DIVISION_BADGE_COLORS: Record<string, string> = {
  "Creative Director": "border-primary/30 text-primary",
  "Content Creator": "border-success/30 text-success",
  "Production": "border-warning/30 text-warning",
  "Project Manager": "border-accent/30 text-accent",
  "Advertiser": "border-danger/30 text-danger",
  "Account Executive": "border-muted/40 text-muted",
  "Copywriter": "border-primary/30 text-primary",
  "Developer": "border-success/30 text-success",
};

export function Header() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { isCollapsed, toggle } = useSidebar();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile((data as unknown as Profile) ?? null);
    }
    load();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const divisions: string[] = Array.isArray(profile?.division) ? (profile!.division as unknown as string[]) : [];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="btn-ghost p-2"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Search tasks, clients..."
            className="input pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Branding: Name + Division Badges */}
        <div className="flex items-center gap-2.5">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-gray-900">
              {profile?.full_name || "User"}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1">
              {divisions.length > 0 ? (
                divisions.map((d) => (
                  <span
                    key={d}
                    className={cn(
                      "rounded-full border bg-surface px-1.5 py-0 text-[10px] font-medium leading-tight",
                      DIVISION_BADGE_COLORS[d] || "border-border text-muted"
                    )}
                  >
                    {d}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-muted">
                  {profile?.role ? profile.role.replace(/_/g, " ") : "No division"}
                </span>
              )}
            </div>
          </div>
          <UserCircle2 size={28} className="shrink-0 text-muted" />
        </div>
        <button
          onClick={handleLogout}
          className="btn-ghost flex items-center gap-1.5 p-2 text-xs"
          title="Logout"
        >
          <LogOut size={16} />
          <span className="hidden lg:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}