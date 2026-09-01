"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CheckSquare, MessageCircle, Users as UsersIcon, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar-context";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

const primaryItems = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Chat", href: "/chat", icon: MessageCircle },
  { label: "Clients", href: "/clients", icon: UsersIcon },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { openMobile } = useSidebar();
  const { chatCount } = useUnreadNotifications();

  // Chat page (mobile) memberi tahu state fullscreen via custom event:
  // - Daftar channel (layar utama) → nav tetap tampil
  // - Chat channel terbuka (fullscreen ala Telegram) → nav disembunyikan
  const [chatFullscreen, setChatFullscreen] = useState(false);

  useEffect(() => {
    const onChatFullscreen = (e: Event) => {
      setChatFullscreen(!!(e as CustomEvent).detail);
    };
    window.addEventListener("chat-mobile-fullscreen", onChatFullscreen);
    return () => {
      window.removeEventListener("chat-mobile-fullscreen", onChatFullscreen);
    };
  }, []);

  // Reset saat navigasi antar halaman (chat page unmount mengirim false,
  // tapi jaga-jaga bila event terlewat)
  useEffect(() => {
    if (!pathname.startsWith("/chat")) setChatFullscreen(false);
  }, [pathname]);

  if (chatFullscreen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Floating bubble bar */}
      <nav
        className="mx-3 mb-3 flex items-stretch gap-1 rounded-full border border-border bg-surface/90 p-1.5 shadow-lg backdrop-blur-xl"
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
                "relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-full transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted hover:text-foreground active:scale-95"
              )}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={22} className="shrink-0" strokeWidth={isActive ? 2.4 : 2} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
              {item.href === "/chat" && chatCount > 0 && (
                <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white shadow">
                  {chatCount > 99 ? "99+" : chatCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* More button — opens full sidebar drawer */}
        <button
          onClick={openMobile}
          className="flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-full text-muted transition-all hover:text-foreground active:scale-95"
          aria-label="Open full menu"
        >
          <Menu size={22} className="shrink-0" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </nav>
    </div>
  );
}