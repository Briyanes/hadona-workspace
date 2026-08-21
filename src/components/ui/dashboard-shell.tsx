"use client";

import { SidebarProvider, useSidebar } from "@/components/ui/sidebar-context";
import { Sidebar } from "@/components/ui/sidebar";
import { Header } from "@/components/ui/header";
import { MobileBottomNav } from "@/components/ui/mobile-bottom-nav";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();
  // Chat mobile = full-bleed (tanpa padding) ala Telegram; desktop tetap normal.
  const isChatPage = pathname === "/chat";

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div
        className={
          isCollapsed
            ? "lg:ml-16 transition-all duration-200"
            : "lg:ml-60 transition-all duration-200"
        }
      >
        <Header />
        {/* pb-20 on mobile to prevent bottom nav from covering content */}
        <main
          className={cn(
            "overflow-x-hidden",
            isChatPage
              ? "p-0 pb-0 lg:p-6 lg:pb-6"
              : "p-4 pb-20 sm:p-6 lg:pb-6"
          )}
        >
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardContent>{children}</DashboardContent>
    </SidebarProvider>
  );
}