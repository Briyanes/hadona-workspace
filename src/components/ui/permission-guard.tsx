"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, type ReactNode } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";

type UserRole = "super_admin" | "project_manager" | "creative_director" | "advertiser" | "account_executive" | "designer" | "copywriter" | "developer";

interface PermissionGuardProps {
  /** Roles allowed to see the content */
  allowedRoles?: UserRole[];
  /** If true, only super_admin + project_manager can access */
  managerOnly?: boolean;
  children: ReactNode;
  /** Optional fallback to show if not permitted */
  fallback?: ReactNode;
}

export function PermissionGuard({
  allowedRoles,
  managerOnly = false,
  children,
  fallback,
}: PermissionGuardProps) {
  const supabase = createClient();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setRole((profile as { role: UserRole } | null)?.role || null);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    checkRole();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  const isManager = role === "super_admin" || role === "project_manager";
  const hasPermission = managerOnly
    ? isManager
    : allowedRoles
    ? allowedRoles.includes(role as UserRole)
    : true;

  if (!hasPermission) {
    return (
      <>
        {fallback || (
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface py-8 text-center">
            <ShieldAlert className="mb-2 text-danger" size={28} />
            <p className="text-sm font-medium text-foreground">Akses Terbatas</p>
            <p className="mt-1 text-xs text-muted">
              Anda tidak memiliki izin untuk melihat konten ini
            </p>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}