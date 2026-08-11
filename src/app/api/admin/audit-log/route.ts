import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/audit-log
 * Admin-only endpoint to view audit trail with filtering
 * Query params: ?page=1&limit=50&action=delete&entity_type=client&user_id=xxx
 */
export async function GET(request: NextRequest) {
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const action = searchParams.get("action");
    const entityType = searchParams.get("entity_type");
    const userIdFilter = searchParams.get("user_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("activity_logs")
      .select(
        "id, user_id, action, entity_type, entity_id, description, metadata, created_at, profiles(full_name, email, avatar_url)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) query = query.eq("action", action);
    if (entityType) query = query.eq("entity_type", entityType);
    if (userIdFilter) query = query.eq("user_id", userIdFilter);
    if (startDate) query = query.gte("created_at", startDate);
    if (endDate) query = query.lte("created_at", endDate);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch audit logs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      logs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error("[audit-log] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}