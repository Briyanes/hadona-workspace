import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRateLimitStats } from "@/lib/rate-limit";

/**
 * GET /api/admin/rate-limit
 * Admin-only endpoint to view rate limit statistics (per-instance snapshot)
 */
export async function GET() {
  try {
    const supabase = createClient();

    // Check auth
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = (await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()) as { data: { role: string } | null };

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const stats = getRateLimitStats();

    return NextResponse.json({
      ...stats,
      note: "Per-instance snapshot (serverless). For production, consider Upstash Redis.",
    });
  } catch (err) {
    console.error("[rate-limit-stats] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}