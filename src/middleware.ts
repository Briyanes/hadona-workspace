import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessRoute } from "@/lib/division-permissions";
import { validateCsrf } from "@/lib/csrf";

type CookieOptions = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieOptions[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow embed routes (they handle their own auth via token)
  if (pathname.startsWith("/embed")) {
    return supabaseResponse;
  }

  // Allow public shared report routes (token-based, no auth)
  if (pathname.startsWith("/shared")) {
    return supabaseResponse;
  }

  // Allow public metadata files (SEO crawlers & PWA install)
  // Without this, /sitemap.xml & /manifest.webmanifest redirect to /login,
  // breaking search engine crawling and "Add to Home Screen"
  if (
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest"
  ) {
    return supabaseResponse;
  }

  // Allow API routes — but enforce CSRF on mutation methods
  // Critical for OAuth callbacks (e.g., /api/meta/callback) where
  // cross-domain redirects may cause cookie/session timing issues
  if (pathname.startsWith("/api/")) {
    // CSRF check for mutation methods (POST, PUT, PATCH, DELETE)
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }
    return supabaseResponse;
  }

  // Allow auth routes
  if (pathname.startsWith("/login") || pathname.startsWith("/signup") || pathname.startsWith("/auth")) {
    if (user && !pathname.startsWith("/auth")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // Protect all other routes
  if (!user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Onboarding & Approval check
  // (skip for auth-related pages to avoid loops)
  if (
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/waiting-approval") &&
    !pathname.startsWith("/rejected") &&
    !pathname.startsWith("/settings") &&
    pathname !== "/logout"
  ) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("division, role, approval_status")
        .eq("id", user.id)
        .single();

      const typedProfile = profile as { 
        division: string[] | null; 
        role: string | null;
        approval_status: string | null;
      } | null;

      // Check approval status FIRST (before division check)
      // pending_onboarding: user baru, belum pilih divisi
      if (typedProfile?.approval_status === "pending_onboarding") {
        // Kalau belum pilih divisi → ke onboarding
        if (!typedProfile.division || (Array.isArray(typedProfile.division) && typedProfile.division.length === 0)) {
          const url = new URL("/onboarding", request.url);
          return NextResponse.redirect(url);
        }
        // Kalau sudah pilih divisi tapi status masih pending_onboarding → ke waiting-approval
        const url = new URL("/waiting-approval", request.url);
        return NextResponse.redirect(url);
      }

      // pending_approval: sudah pilih divisi, nunggu admin approve
      if (typedProfile?.approval_status === "pending_approval") {
        const url = new URL("/waiting-approval", request.url);
        return NextResponse.redirect(url);
      }

      // rejected: admin menolak, tampilkan halaman rejected
      if (typedProfile?.approval_status === "rejected") {
        const url = new URL("/rejected", request.url);
        return NextResponse.redirect(url);
      }

      // approved atau null (legacy user): cek division seperti biasa
      if (typedProfile && (!typedProfile.division || (Array.isArray(typedProfile.division) && typedProfile.division.length === 0))) {
        const url = new URL("/onboarding", request.url);
        return NextResponse.redirect(url);
      }

      // === Division-Based Permission Guard ===
      if (typedProfile && !canAccessRoute(pathname, typedProfile.division, typedProfile.role)) {
        const url = new URL("/", request.url);
        url.searchParams.set("error", "access_denied");
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
    } catch {
      const url = new URL("/onboarding", request.url);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};