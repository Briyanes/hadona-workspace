"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { LogOut, Search, PanelLeftClose, PanelLeftOpen, Menu, Settings, User, ChevronDown, Sun, Moon } from "lucide-react";
import type { Profile } from "@/types";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useTheme } from "@/components/theme-provider";
import { NotificationBell } from "@/components/ui/notification-bell";
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { isCollapsed, toggle, openMobile } = useSidebar();
  const { isDark, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const p = (data as unknown as Profile) ?? null;
      setProfile(p);
      setAvatarUrl(p?.avatar_url ?? null);
    }
    load();
  }, [supabase]);

  // Listen for avatar/profile updates from settings page
  useEffect(() => {
    const handleProfileUpdate = () => {
      async function reload() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
        const p = (data as unknown as Profile) ?? null;
        setProfile(p);
        setAvatarUrl(p?.avatar_url ?? null);
      }
      reload();
    };
    window.addEventListener("profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("profile-updated", handleProfileUpdate);
  }, [supabase]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/tasks?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const divisions: string[] = Array.isArray(profile?.division) ? (profile!.division as unknown as string[]) : [];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 sm:px-6 backdrop-blur">
      {/* SECTION 1: Left — Sidebar toggle + Search */}
      <div className="flex flex-1 items-center gap-2 sm:gap-3">
        {/* Mobile: Hamburger menu */}
        <button
          onClick={openMobile}
          className="btn-ghost p-2 lg:hidden"
          title="Open menu"
        >
          <Menu size={20} />
        </button>
        {/* Desktop: Collapse/expand sidebar */}
        <button
          onClick={toggle}
          className="btn-ghost p-2 hidden lg:inline-flex"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {/* Search bar (functional) */}
        <form onSubmit={handleSearch} className="relative w-full max-w-[200px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks, clients..."
            className="input pl-9"
          />
        </form>
      </div>

      {/* SECTION 2: Right — Badges → Divider → Name → Avatar → Bell */}
      <div className="flex flex-1 items-center justify-end gap-3">
        {/* Division Badges */}
        <div className="hidden items-center gap-1.5 md:flex">
          {divisions.length > 0 ? (
            divisions.map((d) => (
              <span
                key={d}
                className={cn(
                  "whitespace-nowrap rounded-full border bg-surface px-2.5 py-1 text-[10px] font-medium leading-tight",
                  DIVISION_BADGE_COLORS[d] || "border-border text-muted"
                )}
              >
                {d}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-medium text-muted">
              {profile?.role ? profile.role.replace(/_/g, " ") : "No division"}
            </span>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="hidden h-8 w-px bg-border md:block" />

        {/* Profile Name */}
        <div className="hidden text-right sm:block">
          <div className="text-sm font-semibold text-gray-900">
            {profile?.full_name || "User"}
          </div>
        </div>

        {/* Clickable Avatar with Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1 rounded-full transition-transform hover:scale-105 active:scale-95"
            title="Profile menu"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-8 w-8 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary ring-2 ring-border">
                {profile?.full_name?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <ChevronDown
              size={14}
              className={cn(
                "text-muted transition-transform duration-200",
                menuOpen && "rotate-180"
              )}
            />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 origin-top-right animate-slide-up rounded-lg border border-border bg-white shadow-lg dropdown-panel">
              {/* User Info Header */}
              <div className="border-b border-border px-4 py-3">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {profile?.full_name || "User"}
                </p>
                <p className="truncate text-xs text-muted">
                  {profile?.email || ""}
                </p>
              </div>

              {/* Menu Items */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings/profile");
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-surface-hover"
                >
                  <User size={15} className="text-muted" />
                  My Profile
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-surface-hover"
                >
                  <Settings size={15} className="text-muted" />
                  Settings
                </button>
              </div>

              {/* Divider + Logout */}
              <div className="border-t border-border py-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-danger transition-colors hover:bg-danger/5"
                >
                  <LogOut size={15} />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="btn-ghost p-2"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notification Bell */}
        <NotificationBell />
      </div>
    </header>
  );
}
