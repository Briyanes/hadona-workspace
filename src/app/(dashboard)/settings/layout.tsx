"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Bell, Shield, Settings2, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Profile", icon: User },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/security", label: "Security", icon: Shield },
  { href: "/settings/workspace", label: "Workspace", icon: Settings2 },
  { href: "/settings/preferences", label: "Preferences", icon: Palette },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted">Kelola akun, preferensi, dan workspace</p>
      </div>

      {/* Tab Navigation - Scrollable Carousel */}
      <div className="flex gap-1 overflow-x-auto border-b border-border pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-primary dark:border-[#FFD60A] dark:text-[#FFD60A]"
                  : "border-transparent text-muted hover:text-gray-900 dark:hover:text-[#FFD60A]"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}