import { NextRequest, NextResponse } from "next/server";
import { deleteFile } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/auth-api";

export async function DELETE(request: NextRequest) {
  try {
    // Rate limit: 15 deletes per minute per IP
    const rateLimited = applyRateLimit(request, "delete", 15);
    if (rateLimited) return rateLimited;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Key parameter required" }, { status: 400 });
    }

    // ── OWNERSHIP CHECK: Verify the user owns this file or is admin ──
    const { data: fileRecord } = await supabase
      .from("file_attachments")
      .select("uploaded_by")
      .eq("file_url", `${process.env.R2_PUBLIC_URL}/${key}`)
      .maybeSingle();

    const fileData = fileRecord as { uploaded_by: string } | null;

    // Helper: check if current user is admin/PM
    const checkIsAdmin = async (): Promise<boolean> => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      const profileData = profile as { role: string } | null;
      return !!profileData && ["super_admin", "project_manager"].includes(profileData.role);
    };

    // If file is tracked in DB, verify ownership
    if (fileData) {
      const isOwner = fileData.uploaded_by === user.id;
      if (!isOwner && !(await checkIsAdmin())) {
        return NextResponse.json(
          { error: "Forbidden — you can only delete your own files" },
          { status: 403 }
        );
      }
    }

    // If file is NOT in file_attachments (e.g., avatar, logo),
    // check if the key belongs to the user's namespace
    const keyParts = key.split("/");
    const folder = keyParts[0];
    const fileName = keyParts.slice(1).join("/");

    const selfServiceFolders = ["avatar-assets", "client-logos"];
    if (!fileData && selfServiceFolders.includes(folder)) {
      if (!fileName.includes(user.id) && !(await checkIsAdmin())) {
        return NextResponse.json(
          { error: "Forbidden — you can only delete your own files" },
          { status: 403 }
        );
      }
    }

    await deleteFile(key);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Delete failed: " + msg }, { status: 500 });
  }
}