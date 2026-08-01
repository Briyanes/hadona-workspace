import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/admin/users — Admin-only endpoints for user management
 * Uses service role key to bypass RLS
 *
 * DELETE: Soft-delete (deactivate) or hard-delete a user
 *   ?id=<userId>&mode=soft|hard
 *
 * POST: Resend invitation email
 *   body: { email: string }
 */

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (!token) return null;

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  // Check if user is admin/PM
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile?.is_active) return null;
  if (!["super_admin", "project_manager"].includes(profile.role)) return null;

  return data.user;
}

// ============================================
// DELETE - Soft or hard delete user
// ============================================
export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("id");
    const mode = searchParams.get("mode") || "soft";

    if (!targetUserId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (targetUserId === adminUser.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    const supabase = getAdminClient();

    if (mode === "hard") {
      // Hard delete: remove auth user (cascades to profile)
      const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
      if (authError) throw authError;
      return NextResponse.json({ success: true, message: "User permanently deleted" });
    } else {
      // Soft delete: deactivate profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", targetUserId);

      if (updateError) throw updateError;
      return NextResponse.json({ success: true, message: "User deactivated" });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/admin/users DELETE] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================
// POST - Resend invitation / invite by email
// ============================================
export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { email, action } = body;

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const supabase = getAdminClient();

    if (action === "invite") {
      // Generate magic link / invite link
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id"}/onboarding`,
      });

      if (error) throw error;
      return NextResponse.json({ success: true, message: `Invitation sent to ${email}`, data });
    }

    if (action === "reactivate") {
      // Reactivate a deactivated user
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true })
        .eq("email", email);

      if (error) throw error;
      return NextResponse.json({ success: true, message: `User ${email} reactivated` });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/admin/users POST] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}