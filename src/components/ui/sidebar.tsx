"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Users as UsersIcon,
  UserCog,
  Megaphone,
  BarChart3,
  Target,
  Palette,
  Calendar,
  CalendarDays,
  Clock,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { useSidebar } from "@/components/ui/sidebar-context";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Clients", href: "/clients", icon: UsersIcon },
  { label: "Ads Spend", href: "/ads-spend", icon: Megaphone },
  { label: "Weekly Report", href: "/reports", icon: BarChart3 },
  { label: "Strategy (OKR)", href: "/strategy", icon: Target },
  { label: "Creative Requests", href: "/creative", icon: Palette },
  { label: "Content Plans", href: "/content-plans", icon: Calendar },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Timesheet", href: "/timesheet", icon: Clock },
];

const managerItems = [
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "User Management", href: "/users", icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isManager, setIsManager] = useState(false);
  const supabase = createClient();
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();

  useEffect(() => {
    const checkRole = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userData.user.id)
          .single();
        const role = (profile as { role: string } | null)?.role;
        if (role) {
          setIsManager(role === "super_admin" || role === "project_manager");
        }
      }
    };
    checkRole();
  }, [supabase]);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border bg-white transition-all duration-200",
          // Desktop: collapse to 60px or expand to 240px
          isCollapsed ? "w-[60px]" : "w-60",
          // Mobile: off-screen by default, slides in when open (below lg breakpoint)
          "lg:transition-all",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "w-72 shadow-2xl lg:shadow-none lg:w-auto"
        )}
      >
        {/* Zone 1: Brand area (fixed, no scroll) */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b-0 bg-white",
            isCollapsed ? "justify-center px-2" : "gap-2 px-5"
          )}
        >
          <Image
            src="/logo/logo-hadona.png"
            alt="Hadona Digital Media"
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg object-cover"
            priority
          />
          {!isCollapsed && (
            <div>
              <div className="text-sm font-bold text-gray-900">Hadona</div>
              <div className="text-[10px] text-muted">Workspace</div>
            </div>
          )}
        </div>

        {/* Zone 2: Navigation (scrollable) */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                onClick={closeMobile}
                className={cn(
                  "sidebar-link",
                  isActive && "sidebar-link-active",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <Icon size={16} className="shrink-0" />
                {!isCollapsed && item.label}
              </Link>
            );
          })}

          {isManager && (
            <>
              {!isCollapsed && (
                <div className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
                  Management
                </div>
              )}
              {isCollapsed && <div className="my-2 border-t border-border" />}
              {managerItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    onClick={closeMobile}
                    className={cn(
                      "sidebar-link",
                      isActive && "sidebar-link-active",
                      isCollapsed && "justify-center px-0"
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!isCollapsed && item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Zone 3: Settings (fixed at bottom, no absolute) */}
        <div className="shrink-0 border-t border-border bg-surface p-3">
          <Link
            href="/settings"
            title={isCollapsed ? "Settings" : undefined}
            onClick={closeMobile}
            className={cn(
              "sidebar-link",
              pathname === "/settings" && "sidebar-link-active",
              isCollapsed && "justify-center px-0"
            )}
          >
            <Settings size={16} className="shrink-0" />
            {!isCollapsed && "Settings"}
          </Link>
        </div>
      </aside>
    </>
  );
}