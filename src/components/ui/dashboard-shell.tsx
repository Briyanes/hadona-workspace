"use client";

import { SidebarProvider, useSidebar } from "@/components/ui/sidebar-context";
import { Sidebar } from "@/components/ui/sidebar";
import { Header } from "@/components/ui/header";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className={isCollapsed ? "ml-[60px] transition-all duration-200" : "ml-60 transition-all duration-200"}>
        <Header />
        <main className="p-6">{children}</main>
      </div>
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