/**
 * 🔧 DEBUG ENDPOINT — Return role & auth info user yang sedang login
 * ============================================================================
 * Endpoint: GET /api/reports/debug-me
 *
 * TUJUAN:
 *   Untuk diagnose bug "Forbidden" saat Sync Now. User cukup buka URL ini
 *   di browser (sambil login) untuk lihat:
 *   - apakah session valid
 *   - apa role yang tersimpan di DB
 *   - apakah role tersebut diizinkan untuk sync
 *
 * NOTE: Endpoint ini sengaja dibuat sederhana & aman (hanya baca data).
 *       Bisa dihapus setelah bug selesai di-investigasi.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_SYNC_ROLES = ["super_admin", "project_manager", "creative_director"];

export async function GET() {
  try {
    // 🔒 Security: Disable in production
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "This endpoint is disabled in production" },
        { status: 404 }
      );
    }

    const supabase = createClient();

    // 1. Cek session
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({
        authenticated: false,
        message: "Tidak ada session. Login dulu lalu refresh halaman ini.",
        hint: "Buka /login, login, lalu kembali ke /api/reports/debug-me",
      }, { status: 401 });
    }

    // 2. Cek profile
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, division")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({
        authenticated: true,
        userId: user.id,
        userEmail: user.email,
        profile: null,
        message: "⚠️ Profile TIDAK DITEMUKAN di tabel profiles!",
        hint: "User ada di auth.users tapi tidak ada di tabel profiles. Ini bug — jalankan trigger atau insert manual.",
        debug: { profileError: profileErr?.message },
      }, { status: 200 });
    }

    // 3. Cek role vs allowed
    const role = (profile as { role?: string | null }).role;
    const isAllowed = role ? ALLOWED_SYNC_ROLES.includes(role) : false;

    // 4. Suggest fix kalau role tidak allowed
    let suggestion = "";
    if (!role) {
      suggestion = "❌ Role NULL — jalankan SQL: UPDATE profiles SET role='super_admin' WHERE id='" + user.id + "'";
    } else if (!isAllowed) {
      // Cek apakah ini kasus legacy typo (mis. "superadmin" tanpa underscore)
      const normalizedRole = role.replace(/[_\s]/g, "").toLowerCase();
      const normalizedAllowed = ALLOWED_SYNC_ROLES.map(r => r.replace(/[_\s]/g, "").toLowerCase());
      if (normalizedAllowed.includes(normalizedRole)) {
        suggestion = `⚠️ Role Anda "${role}" sepertinya typo legacy. ` +
          `Compare dengan yang valid: ${ALLOWED_SYNC_ROLES.join(", ")}. ` +
          `Jalankan SQL: UPDATE profiles SET role='super_admin' WHERE id='${user.id}'`;
      } else {
        suggestion = `ℹ️ Role Anda "${role}" valid tapi tidak diizinkan untuk sync. ` +
          `Yang diizinkan: ${ALLOWED_SYNC_ROLES.join(", ")}. ` +
          `Minta admin promote role Anda via User Management.`;
      }
    } else {
      suggestion = "✅ Role Anda valid untuk sync! Klik Sync Now di /reports harusnya berhasil.";
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile: {
        id: (profile as { id?: string }).id,
        email: (profile as { email?: string }).email,
        full_name: (profile as { full_name?: string }).full_name,
        role,
        is_active: (profile as { is_active?: boolean }).is_active,
        division: (profile as { division?: string }).division,
      },
      sync: {
        allowed: isAllowed,
        allowedRoles: ALLOWED_SYNC_ROLES,
      },
      suggestion,
      timestamp: new Date().toISOString(),
      commit: "5568d19-debug",
    }, { status: 200 });
  } catch (err) {
    return NextResponse.json({
      error: "Internal server error",
      message: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}