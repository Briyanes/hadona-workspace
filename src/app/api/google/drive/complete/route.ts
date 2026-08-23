import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/google/drive/complete
 * Dipanggil browser SETELAH resumable PUT ke Google sukses.
 * Menyimpan metadata file ke tabel creative_deliverables (version auto-increment)
 * dan mengirim notifikasi in-app ke creator creative request.
 *
 * Body: {
 *   creative_request_id, file_name, file_size, mime_type,
 *   drive_file_id, drive_web_view_link, drive_web_content_link,
 *   drive_folder_id, note?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      creative_request_id,
      file_name,
      file_size,
      mime_type,
      drive_file_id,
      drive_web_view_link,
      drive_web_content_link,
      drive_folder_id,
      note,
    } = body as {
      creative_request_id: string;
      file_name: string;
      file_size: number | null;
      mime_type: string | null;
      drive_file_id: string | null;
      drive_web_view_link: string | null;
      drive_web_content_link: string | null;
      drive_folder_id: string | null;
      note: string | null;
    };

    if (!creative_request_id || !file_name) {
      return NextResponse.json(
        { error: "creative_request_id dan file_name wajib diisi" },
        { status: 400 }
      );
    }

    // Ambil versi terakhir untuk request ini
    const { data: lastVersion } = await (supabase
      .from("creative_deliverables") as unknown as {
      select: (_cols?: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { version: number }[] | null }> } } };
    }).select("version").eq("creative_request_id", creative_request_id)
      .order("version", { ascending: false }).limit(1);

    const nextVersion = lastVersion?.[0]?.version ? lastVersion[0].version + 1 : 1;

    // Insert deliverable
    const { data: inserted, error: insertError } = await (supabase
      .from("creative_deliverables") as unknown as {
      insert: (row: Record<string, unknown>) => { select: () => Promise<{ data: unknown; error: { message: string } | null }> };
    }).insert({
      creative_request_id,
      uploaded_by: user.id,
      version: nextVersion,
      file_name,
      file_size: file_size || null,
      mime_type: mime_type || null,
      drive_file_id: drive_file_id || null,
      drive_web_view_link: drive_web_view_link || null,
      drive_web_content_link: drive_web_content_link || null,
      drive_folder_id: drive_folder_id || null,
      note: note || null,
      status: "uploaded",
    }).select();

    if (insertError) {
      throw new Error(insertError.message);
    }

    // Notifikasi ke creator & assignee creative request (bypass RLS via service role)
    try {
      const { data: reqRow } = await (supabase
        .from("creative_requests") as unknown as {
        select: (_cols?: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { created_by: string | null; assigned_to: string | null; client?: { name: string | null } | { name: string | null }[] } | null }> } };
      }).select("created_by, assigned_to, client:clients(name)").eq("id", creative_request_id).maybeSingle();

      if (reqRow) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (serviceKey) {
          const { createClient: createAdminClient } = await import("@supabase/supabase-js");
          const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceKey,
            { auth: { persistSession: false } }
          );

          const clientObj = Array.isArray(reqRow.client) ? reqRow.client[0] : reqRow.client;
          const clientLabel = clientObj?.name || "tanpa client";
          const recipients = new Set(
            [reqRow.created_by, reqRow.assigned_to].filter(Boolean) as string[]
          );
          // Jangan notifikasi diri sendiri
          recipients.delete(user.id);

          for (const recipient of Array.from(recipients)) {
            await admin.from("notifications").insert({
              user_id: recipient,
              type: "creative_deliverable",
              title: `🎬 Hasil edit v${nextVersion} diupload`,
              body: `${file_name.slice(0, 80)} untuk request ${clientLabel} sudah tersimpan di Google Drive. Segera review.`,
              link: "/content-studio",
            });
          }
        }
      }
    } catch (notifErr) {
      // Non-critical — jangan gagalkan request
      console.warn("[google/drive/complete] Notification failed:", notifErr);
    }

    return NextResponse.json({ success: true, deliverable: inserted, version: nextVersion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[google/drive/complete] Error:", msg);
    return NextResponse.json({ error: "Gagal menyimpan deliverable: " + msg }, { status: 500 });
  }
}