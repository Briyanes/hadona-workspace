import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/google/drive/complete
 * Dipanggil browser SETELAH resumable PUT ke Google sukses.
 * Menyimpan metadata file ke tabel creative_deliverables / task_deliverables
 * (version auto-increment) dan mengirim notifikasi in-app ke terkait.
 *
 * Body: {
 *   creative_request_id? , task_id?, file_name, file_size, mime_type,
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
      task_id,
      file_name,
      file_size,
      mime_type,
      drive_file_id,
      drive_web_view_link,
      drive_web_content_link,
      drive_folder_id,
      note,
    } = body as {
      creative_request_id?: string;
      task_id?: string;
      file_name: string;
      file_size: number | null;
      mime_type: string | null;
      drive_file_id: string | null;
      drive_web_view_link: string | null;
      drive_web_content_link: string | null;
      drive_folder_id: string | null;
      note: string | null;
    };

    if ((!creative_request_id && !task_id) || !file_name) {
      return NextResponse.json(
        { error: "file_name dan salah satu dari creative_request_id / task_id wajib diisi" },
        { status: 400 }
      );
    }

    // ── MODE TASK: simpan ke task_deliverables + notifikasi creator & assignee task ──
    if (task_id) {
      // Ambil versi terakhir untuk task ini
      const { data: lastTaskVersion } = await (supabase
        .from("task_deliverables") as unknown as {
        select: (_cols?: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { version: number }[] | null }> } } };
      }).select("version").eq("task_id", task_id)
        .order("version", { ascending: false }).limit(1);

      const nextTaskVersion = lastTaskVersion?.[0]?.version ? lastTaskVersion[0].version + 1 : 1;

      const { data: insertedTask, error: insertTaskError } = await (supabase
        .from("task_deliverables") as unknown as {
        insert: (row: Record<string, unknown>) => { select: () => Promise<{ data: unknown; error: { message: string } | null }> };
      }).insert({
        task_id,
        uploaded_by: user.id,
        version: nextTaskVersion,
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

      if (insertTaskError) {
        throw new Error(insertTaskError.message);
      }

      // Notifikasi ke creator & assignees task (bypass RLS via service role)
      try {
        const { data: taskRow } = await (supabase
          .from("tasks") as unknown as {
          select: (_cols?: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { created_by: string | null; title: string | null; task_assignees?: { user_id: string }[] } | null }> } };
        }).select("created_by, title, task_assignees(user_id)").eq("id", task_id).maybeSingle();

        if (taskRow) {
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (serviceKey) {
            const { createClient: createAdminClient } = await import("@supabase/supabase-js");
            const admin = createAdminClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              serviceKey,
              { auth: { persistSession: false } }
            );

            const recipients = new Set<string>([taskRow.created_by || ""]);
            for (const a of taskRow.task_assignees || []) {
              if (a.user_id) recipients.add(a.user_id);
            }
            // Jangan notifikasi diri sendiri
            recipients.delete(user.id);

            const taskTitle = (taskRow.title || "Task").slice(0, 60);
            for (const recipient of Array.from(recipients).filter(Boolean)) {
              await admin.from("notifications").insert({
                user_id: recipient,
                type: "task_deliverable",
                title: `📎 File v${nextTaskVersion} dilampirkan ke task`,
                body: `${file_name.slice(0, 80)} untuk task "${taskTitle}" tersimpan di Google Drive.`,
                link: `/tasks`,
              });
            }
          }
        }
      } catch (notifErr) {
        // Non-critical — jangan gagalkan request
        console.warn("[google/drive/complete] Task notification failed:", notifErr);
      }

      return NextResponse.json({ success: true, deliverable: insertedTask, version: nextTaskVersion });
    }

    // ── MODE CREATIVE REQUEST (existing) ──

    // Ambil versi terakhir untuk request ini
    const { data: lastVersion } = await (supabase
      .from("creative_deliverables") as unknown as {
      select: (_cols?: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: { version: number }[] | null }> } } };
    }).select("version").eq("creative_request_id", creative_request_id!)
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
      }).select("created_by, assigned_to, client:clients(name)").eq("id", creative_request_id!).maybeSingle();

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