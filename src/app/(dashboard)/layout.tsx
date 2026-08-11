import { DashboardShell } from "@/components/ui/dashboard-shell";
import { CommandPalette } from "@/components/ui/command-palette";
import { Breadcrumb } from "@/components/ui/breadcrumb";
 
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
         {/* Breadcrumb Navigation */}
         <div className="px-4 pt-3 sm:px-6 lg:px-8">
           <Breadcrumb />
         </div>
         <div id="main-content" tabIndex={-1}>
           {children}
         </div>
       </DashboardShell>
     </>
   );
 }
