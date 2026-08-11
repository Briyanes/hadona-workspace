"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbConfig {
  label: string;
  parent?: string;
}

const ROUTE_LABELS: Record<string, BreadcrumbConfig> = {
  "/": { label: "Dashboard" },
  "/tasks": { label: "Tasks" },
  "/clients": { label: "Clients" },
  "/ads-spend": { label: "Ads Spend" },
  "/reports": { label: "Weekly Report" },
  "/strategy": { label: "Strategy (OKR)" },
  "/creative": { label: "Creative Requests" },
  "/content-plans": { label: "Content Plans" },
  "/content-studio": { label: "Content Studio" },
  "/production": { label: "Production" },
  "/brand-kit": { label: "Brand Kit" },
  "/leads": { label: "Lead Pipeline" },
  "/chat": { label: "Team Chat" },
  "/calendar": { label: "Calendar" },
  "/timesheet": { label: "Timesheet" },
  "/invoices": { label: "Invoices" },
  "/users": { label: "User Management" },
  "/settings": { label: "Settings" },
  "/settings/profile": { label: "Profile", parent: "/settings" },
  "/settings/security": { label: "Security", parent: "/settings" },
  "/settings/integrations": { label: "Integrations", parent: "/settings" },
  "/settings/notifications": { label: "Notifications", parent: "/settings" },
  "/settings/workspace": { label: "Workspace", parent: "/settings" },
  "/settings/preferences": { label: "Preferences", parent: "/settings" },
};

export function Breadcrumb() {
  const pathname = usePathname();

  // Don't show breadcrumb on dashboard root
  if (pathname === "/") return null;

  // Handle dynamic routes like /clients/[id]
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];

  // Always start with Home
  breadcrumbs.push({ label: "Dashboard", href: "/" });

  let currentPath = "";
  for (let i = 0; i < segments.length; i++) {
    currentPath += "/" + segments[i];

    // Check if it's a known route
    const config = ROUTE_LABELS[currentPath];
    if (config) {
      breadcrumbs.push({ label: config.label, href: currentPath });
    } else if (i === segments.length - 1) {
      // Last segment — likely a detail page (e.g., /clients/123 → "Detail")
      const parentPath = "/" + segments.slice(0, -1).join("/");
      const parentConfig = ROUTE_LABELS[parentPath];
      if (parentConfig) {
        // Show "Detail" for nested pages
        breadcrumbs.push({
          label: segments[i].length > 20 ? "Detail" : "Detail",
          href: currentPath,
        });
      }
    }
  }

  // Remove duplicates
  const uniqueBreadcrumbs = breadcrumbs.filter(
    (b, idx, self) => idx === 0 || b.href !== self[idx - 1].href
  );

  if (uniqueBreadcrumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted">
      {uniqueBreadcrumbs.map((crumb, idx) => {
        const isLast = idx === uniqueBreadcrumbs.length - 1;
        const isFirst = idx === 0;

        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {idx > 0 && <ChevronRight size={12} className="text-muted/50" />}
            {isFirst && <Home size={12} className="text-muted/70" />}
            {isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className={cn(
                  "transition-colors hover:text-primary",
                  isFirst && "text-muted/70"
                )}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}