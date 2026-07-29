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
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

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
];

const managerItems = [{ label: "User Management", href: "/users", icon: UserCog }];

export function Sidebar() {
  const pathname = usePathname();
  const [isManager, setIsManager] = useState(false);
  const supabase = createClient();

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
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-hadona-yellow-dark bg-hadona-yellow">
      <div className="flex h-16 items-center gap-2 border-b border-hadona-yellow-dark px-5">
        <Image
          src="/logo/logo-hadona.png"
          alt="Hadona Digital Media"
          width={32}
          height={32}
          className="h-8 w-8 rounded-lg object-cover"
          priority
        />
        <div>
          <div className="text-sm font-bold text-gray-900">Hadona</div>
          <div className="text-[10px] font-medium text-gray-700">Workspace</div>
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

        {isManager && (
          <>
            <div className="mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
              Management
            </div>
            {managerItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
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
          </>
        )}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-hadona-yellow-dark p-3">
        <Link href="/settings" className={cn("sidebar-link", pathname === "/settings" && "sidebar-link-active")}>
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}