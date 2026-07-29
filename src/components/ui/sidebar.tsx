"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Megaphone,
  BarChart3,
  Target,
  Palette,
  Calendar,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Ads Spend", href: "/ads-spend", icon: Megaphone },
  { label: "Weekly Report", href: "/reports", icon: BarChart3 },
  { label: "Strategy (OKR)", href: "/strategy", icon: Target },
  { label: "Creative Requests", href: "/creative", icon: Palette },
  { label: "Content Plans", href: "/content-plans", icon: Calendar },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-sm font-bold text-white">
          H
        </div>
        <div>
          <div className="text-sm font-bold text-white">Hadona</div>
          <div className="text-[10px] text-muted">Workspace</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("sidebar-link", isActive && "sidebar-link-active")}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-border p-3">
        <Link href="/settings" className={cn("sidebar-link", pathname === "/settings" && "sidebar-link-active")}>
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}