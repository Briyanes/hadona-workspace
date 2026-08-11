"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CheckSquare, Users as UsersIcon, BarChart3, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar-context";

const primaryItems = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Clients", href: "/clients", icon: UsersIcon },
  { label: "Reports", href: "/reports", icon: BarChart3 },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { openMobile } = useSidebar();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile bottom navigation"
    >
      {primaryItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              isActive ? "text-primary" : "text-muted"
            )}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon size={20} className="shrink-0" />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}

      {/* More button — opens full sidebar drawer */}
      <button
        onClick={openMobile}
        className={cn(
          "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
          "text-muted"
        )}
        aria-label="Open full menu"
      >
        <Menu size={20} className="shrink-0" />
        <span className="text-[10px] font-medium leading-none">More</span>
      </button>
    </nav>
  );
}