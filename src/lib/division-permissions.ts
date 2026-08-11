/**
 * Division-Based Menu Permissions
 *
 * Concept: "Show All + Lock" — semua menu tampil di sidebar,
 * tapi menu yang tidak sesuai divisi user ditampilkan dengan
 * state "locked" (opacity + 🔒 icon).
 *
 * Tier 1 — Always Visible (semua user): Dashboard, Tasks, Calendar, Timesheet
 * Tier 2 — Division-Specific (locked jika tidak sesuai divisi)
 * Tier 3 — Management Only (HIDDEN, bukan locked): Invoices, User Management
 */

// === Types ===

export interface MenuAccessConfig {
  /** Route path (matches sidebar href) */
  href: string;
  /** Divisions that have full access. Empty = semua user. */
  allowedDivisions: string[];
  /** Roles that always have access regardless of division (e.g., super_admin) */
  allowedRoles?: string[];
  /** If true, menu is hidden entirely for unauthorized users (not locked) */
  hiddenIfUnauthorized?: boolean;
}

// === Division Constants ===

export const DIVISIONS = [
  "Creative Director",
  "Content Creator",
  "Production",
  "Project Manager",
  "Advertiser",
  "Account Executive",
  "Copywriter",
  "Developer",
] as const;

export type Division = (typeof DIVISIONS)[number];

// === Roles ===

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  PROJECT_MANAGER: "project_manager",
  ADVERTISER: "advertiser",
} as const;

// === Menu Access Map ===

export const MENU_ACCESS: MenuAccessConfig[] = [
  // Tier 1 — Always accessible (semua user)
  {
    href: "/",
    allowedDivisions: [], // empty = semua user
  },
  {
    href: "/tasks",
    allowedDivisions: [],
  },
  {
    href: "/calendar",
    allowedDivisions: [],
  },
  {
    href: "/timesheet",
    allowedDivisions: [],
  },

  // Tier 2 — Division-specific (show + lock if unauthorized)
  {
    href: "/clients",
    allowedDivisions: [
      "Account Executive",
      "Project Manager",
      "Developer",
      "Content Creator",
      "Creative Director",
      "Copywriter",
      "Production",
    ],
    allowedRoles: ["super_admin", "project_manager"],
  },
  {
    href: "/ads-spend",
    allowedDivisions: ["Advertiser", "Project Manager", "Developer"],
    allowedRoles: ["super_admin", "project_manager"],
  },
  {
    href: "/reports",
    allowedDivisions: ["Advertiser", "Account Executive", "Project Manager", "Developer"],
    allowedRoles: ["super_admin", "project_manager"],
  },
  {
    href: "/strategy",
    allowedDivisions: ["Account Executive", "Project Manager", "Advertiser", "Developer"],
    allowedRoles: ["super_admin", "project_manager"],
  },
  {
    href: "/creative",
    allowedDivisions: ["Content Creator", "Production", "Creative Director", "Copywriter"],
  },
  {
    href: "/content-plans",
    allowedDivisions: ["Content Creator", "Project Manager", "Creative Director", "Copywriter"],
    allowedRoles: ["super_admin", "project_manager"],
  },
  {
    href: "/content-studio",
    allowedDivisions: ["Content Creator", "Project Manager", "Creative Director", "Copywriter", "Production"],
    allowedRoles: ["super_admin", "project_manager"],
  },

  // Tier 3 — Management only (HIDDEN for unauthorized, not locked)
  {
    href: "/invoices",
    allowedDivisions: ["Project Manager"],
    allowedRoles: ["super_admin", "project_manager"],
    hiddenIfUnauthorized: true,
  },
  {
    href: "/users",
    allowedDivisions: ["Project Manager"],
    allowedRoles: ["super_admin", "project_manager"],
    hiddenIfUnauthorized: true,
  },
];

// === Helper Functions ===

/**
 * Check if a user can access a specific menu/route.
 *
 * @param pathname - Route path (e.g., "/ads-spend")
 * @param divisions - User's divisions array (from profile.division)
 * @param role - User's role (from profile.role)
 * @returns 'full' | 'locked' | 'hidden'
 */
export function checkMenuAccess(
  pathname: string,
  divisions: string[] | null | undefined,
  role: string | null | undefined
): "full" | "locked" | "hidden" {
  // Normalize pathname — remove trailing slash, get base path
  const normalizedPath = pathname.replace(/\/$/, "") || "/";

  // Find config for this path
  // Match exact or prefix (e.g., /clients/123 → /clients)
  const config = MENU_ACCESS.find(
    (c) => normalizedPath === c.href || normalizedPath.startsWith(c.href + "/")
  );

  // If no config found, default to full access (e.g., /settings, /onboarding)
  if (!config) return "full";

  // Super admin always has full access
  if (role === ROLES.SUPER_ADMIN) return "full";

  // If config allows all (empty allowedDivisions + no role restriction)
  if (config.allowedDivisions.length === 0 && (!config.allowedRoles || config.allowedRoles.length === 0)) {
    return "full";
  }

  // Check role-based access (e.g., project_manager always has access)
  if (config.allowedRoles && role && config.allowedRoles.includes(role)) {
    return "full";
  }

  // Check division-based access
  if (divisions && divisions.length > 0) {
    const hasDivision = divisions.some((d) => config.allowedDivisions.includes(d));
    if (hasDivision) return "full";
  }

  // Unauthorized — return hidden or locked based on config
  return config.hiddenIfUnauthorized ? "hidden" : "locked";
}

/**
 * Check if user can access a route (for middleware/page-level guards).
 * Returns true if 'full' access, false otherwise.
 */
export function canAccessRoute(
  pathname: string,
  divisions: string[] | null | undefined,
  role: string | null | undefined
): boolean {
  return checkMenuAccess(pathname, divisions, role) === "full";
}

/**
 * Get list of locked menus for display purposes.
 */
export function getLockedMenus(divisions: string[] | null, role: string | null): string[] {
  return MENU_ACCESS.filter((c) => checkMenuAccess(c.href, divisions, role) === "locked").map(
    (c) => c.href
  );
}