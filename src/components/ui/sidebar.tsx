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
  PieChart,
  Target,
  Palette,
  Calendar,
  Clapperboard,
  CalendarDays,
  Clock,
  FileText,
  Settings,
  Lock,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/ui/sidebar-context";
import { checkMenuAccess, MENU_ACCESS } from "@/lib/division-permissions";
import { toast } from "sonner";

interface UserProfile {
  role: string;
  division: string[] | null;
}

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Operational",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      { label: "Calendar", href: "/calendar", icon: CalendarDays },
      { label: "Timesheet", href: "/timesheet", icon: Clock },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Clients", href: "/clients", icon: UsersIcon },
      { label: "Leads Pipeline", href: "/leads", icon: Target },
      { label: "Invoices", href: "/invoices", icon: FileText },
    ],
  },
  {
    title: "Performance",
    items: [
      { label: "Ads Spend", href: "/ads-spend", icon: Megaphone },
      { label: "Weekly Report", href: "/reports", icon: BarChart3 },
      { label: "Monthly Report", href: "/monthly-reports", icon: PieChart },
      { label: "Strategy (OKR)", href: "/strategy", icon: Target },
    ],
  },
  {
    title: "Creative",
    items: [
      { label: "Creative Requests", href: "/creative", icon: Palette },
      { label: "Content Plans", href: "/content-plans", icon: Calendar },
      { label: "Content Studio", href: "/content-studio", icon: Clapperboard },
      { label: "Production", href: "/production", icon: Clapperboard },
      { label: "Brand Kits", href: "/brand-kits", icon: Palette },
      { label: "Approvals", href: "/approvals", icon: FileText },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Team Chat", href: "/chat", icon: MessageSquare },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "User Management", href: "/users", icon: UserCog },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const supabase = createClient();
  const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();

  useEffect(() => {
    const loadProfile = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role, division")
          .eq("id", userData.user.id)
          .single();
        if (profileData) {
          setProfile(profileData as unknown as UserProfile);
        }
      }
    };
    loadProfile();
  }, [supabase]);

  const iconSize = isCollapsed ? 20 : 18;

  /**
   * Handle click on locked menu item — show toast notification
   */
  function handleLockedClick(label: string, href: string) {
    const accessConfig = MENU_ACCESS.find((c) => c.href === href);
    const divisions = accessConfig?.allowedDivisions?.length
      ? accessConfig.allowedDivisions.join(", ")
      : "Admin";

    toast.info(`🔒 ${label} untuk divisi: ${divisions}. Hubungi Admin untuk akses.`, {
      duration: 4000,
    });
  }

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
          "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border bg-surface transition-all duration-200",
          // Desktop: collapse to 64px or expand to 240px
          isCollapsed ? "w-16" : "w-60",
          // Mobile: off-screen by default, slides in when open (below lg breakpoint)
          "lg:transition-all",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "w-72 shadow-2xl lg:shadow-none lg:w-auto"
        )}
      >
        {/* Zone 1: Brand area (fixed, no scroll) */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b-0 bg-surface",
            isCollapsed ? "justify-center px-2" : "gap-2 px-5"
          )}
        >
          <Image
            src="/logo/logo-hadona.png"
            alt="Hadona Digital Media"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
            priority
          />
          {!isCollapsed && (
            <div>
              <div className="text-sm font-bold text-foreground">Hadona</div>
              <div className="text-[10px] text-muted">Workspace</div>
            </div>
          )}
        </div>

        {/* Zone 2: Navigation (scrollable) */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden p-3",
            isCollapsed ? "space-y-2" : "space-y-4"
          )}
        >
          {navSections.map((section, sectionIdx) => {
            // Filter visible items first
            const visibleItems = section.items.filter((item) => {
              const access = profile
                ? checkMenuAccess(item.href, profile.division, profile.role)
                : "full";
              return access !== "hidden";
            });

            // Skip empty sections
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className={cn(isCollapsed ? "space-y-2" : "space-y-1")}>
                {/* Section Title */}
                {!isCollapsed && (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted/60">
                    {section.title}
                  </p>
                )}
                {/* Collapsed separator */}
                {isCollapsed && sectionIdx > 0 && (
                  <div className="mx-3 my-1 border-t border-border" />
                )}
                {/* Section Items */}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));

                  const access = profile
                    ? checkMenuAccess(item.href, profile.division, profile.role)
                    : "full";

                  const isLocked = access === "locked";

                  // Locked menu item
                  if (isLocked) {
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => handleLockedClick(item.label, item.href)}
                        title={isCollapsed ? `🔒 ${item.label}` : undefined}
                        className={cn(
                          "sidebar-link cursor-not-allowed opacity-40 hover:opacity-60",
                          isCollapsed && "justify-center px-0 py-2.5"
                        )}
                      >
                        <div className="relative shrink-0">
                          <Icon size={iconSize} />
                          {isCollapsed && (
                            <Lock
                              size={10}
                              className="absolute -bottom-1 -right-1 rounded-full bg-white text-muted"
                            />
                          )}
                        </div>
                        {!isCollapsed && (
                          <span className="flex items-center gap-1.5">
                            {item.label}
                            <Lock size={10} className="text-muted" />
                          </span>
                        )}
                      </button>
                    );
                  }

                  // Full access menu item
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.label : undefined}
                      onClick={closeMobile}
                      className={cn(
                        "sidebar-link",
                        isActive && "sidebar-link-active",
                        isCollapsed && "justify-center px-0 py-2.5"
                      )}
                    >
                      <Icon size={iconSize} className="shrink-0" />
                      {!isCollapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
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
              isCollapsed && "justify-center px-0 py-2.5"
            )}
          >
            <Settings size={iconSize} className="shrink-0" />
            {!isCollapsed && "Settings"}
          </Link>
        </div>
      </aside>
    </>
  );
}