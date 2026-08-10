import { DashboardShell } from "@/components/ui/dashboard-shell";
import { CommandPalette } from "@/components/ui/command-palette";
 
 export const dynamic = "force_dynamic";
 
 export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <CommandPalette />
      {children}
    </DashboardShell>
  );
 }
