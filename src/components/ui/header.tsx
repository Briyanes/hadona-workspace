"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types";
import { useSidebar } from "@/components/ui/sidebar-context";

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

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-xs font-semibold text-gray-900">
            {getInitials(profile?.full_name)}
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-medium text-gray-900">{profile?.full_name || "User"}</div>
            <div className="text-xs capitalize text-muted">{profile?.division || profile?.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-ghost p-2" title="Logout">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}