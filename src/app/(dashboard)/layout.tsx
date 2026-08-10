import { DashboardShell } from "@/components/ui/dashboard-shell";
import { CommandPalette } from "@/components/ui/command-palette";
 
 export const dynamic = "force_dynamic";
 
 export default function DashboardLayout({ children }: { children: React.ReactNode }) {
   return (
     <>
       {/* Accessibility: Skip to main content for keyboard/screen reader users */}
       <a href="#main-content" className="skip-link">
         Lewati ke konten utama
       </a>
       <DashboardShell>
         <CommandPalette />
         <div id="main-content" tabIndex={-1}>
           {children}
         </div>
       </DashboardShell>
     </>
   );
 }
