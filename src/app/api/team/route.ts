import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

// Force dynamic rendering — this route reads request.headers at runtime
export const dynamic = "force-dynamic";

/**
 * /api/team — Server-side handler that uses SERVICE ROLE KEY
 * to bypass RLS policies that block non-manager users from reading profiles.
 *
 * GET: Returns all team members (id, full_name) ordered by full_name
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (token) {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  }

  // Fallback: cookie-based session (browser fetch() tanpa Authorization header,
  // contoh: modal Grup/Invite/DM di halaman chat). Pola sama dengan /api/chat/*.
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getAdminClient();

    // Support optional division filter: /api/team?division=Content Creator
    const divisionFilter = request.nextUrl.searchParams.get("division");

    let query = supabase
      .from("profiles")
      .select("id, full_name, role, division, is_active")
      .eq("is_active", true);

    if (divisionFilter) {
      // division is now TEXT[] — use "cs" (contains) operator
      query = query.filter("division", "cs", `{${divisionFilter}}`);
    }

    const { data, error } = await query.order("full_name");

    if (error) throw error;

    // Tandai user sendiri + sediakan objek `me` agar client (mis. chat)
    // dapat menentukan pesan milik sendiri (alignment bubble).
    const team = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      is_me: p.id === user.id,
    }));
    const me = team.find((p: { is_me: boolean }) => p.is_me) || null;

    return NextResponse.json({ team, me });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/team] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}