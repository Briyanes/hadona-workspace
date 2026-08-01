import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // Allow API routes (they handle their own auth internally)
  // Critical for OAuth callbacks (e.g., /api/meta/callback) where
  // cross-domain redirects may cause cookie/session timing issues
  if (pathname.startsWith("/api/")) {
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

  // Onboarding check: if user has no division set, redirect to /onboarding
  // (skip for /onboarding itself, /settings, and /logout to avoid loops)
  if (
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/settings") &&
    pathname !== "/logout"
  ) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("division")
        .eq("id", user.id)
        .single();

      if (profile && (!profile.division || (Array.isArray(profile.division) && profile.division.length === 0))) {
        const url = new URL("/onboarding", request.url);
        return NextResponse.redirect(url);
      }
    } catch {
      // If profile doesn't exist yet, the handle_new_user trigger may not have run.
      // Let the onboarding page handle profile creation.
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