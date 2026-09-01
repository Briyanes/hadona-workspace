"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";

/**
 * Floating Chat Button (desktop only).
 *
 * Muncul di pojok kanan bawah HANYA pada viewport >= lg (1024px) —
 * inversi persis dari MobileBottomNav (`lg:hidden`) sehingga keduanya
 * tidak pernah tampil bersamaan. Di mobile/tablet, akses Chat sudah
 * tersedia via bottom navbar.
 *
 * Auto-hide saat sudah berada di halaman /chat (navigasi redundan).
 */
export function FloatingChatButton() {
  const pathname = usePathname();
  const isChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  const { chatCount } = useUnreadNotifications();

  if (isChatPage) return null;

  return (
    <Link
      href="/chat"
      aria-label="Buka Team Chat"
      title="Team Chat"
      className={cn(
        "hidden lg:flex",
        "fixed bottom-6 right-6 z-30",
        "h-12 w-12 items-center justify-center",
        "rounded-full bg-primary text-primary-foreground shadow-lg",
        "transition-all hover:shadow-xl hover:brightness-110",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-95"
      )}
    >
      <MessageCircle size={22} strokeWidth={2.2} className="shrink-0" />
      {chatCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white shadow">
          {chatCount > 99 ? "99+" : chatCount}
        </span>
      )}
    </Link>
  );
}