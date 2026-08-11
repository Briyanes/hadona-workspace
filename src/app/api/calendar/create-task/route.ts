import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizePlainText, sanitizeHtml } from "@/lib/sanitize";

/**
 * POST /api/calendar/create-task
 *
 * Creates a task + assigns it to a PM (task_assignees) server-side.
 * Uses service role key to bypass RLS policies that block client-side inserts.
 *
 * Body:
 *   title: string
 *   description: string
 *   due_date: string (YYYY-MM-DD)
 *   client_id?: string | null
 *   pm_user_id: string
 *   event_id?: string  (to link back to calendar_events.linked_task_id)
 *   created_by?: string | null
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, due_date, client_id, pm_user_id, event_id, created_by } = body;

    if (!title || !due_date || !pm_user_id) {
      return NextResponse.json(
        { error: "Missing required fields: title, due_date, pm_user_id" },
        { status: 400 }
      );
    }

    // Use service role key to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Step 1: Insert task
    const { data: taskData, error: taskError } = await supabaseAdmin
      .from("tasks")
      .insert({
        title: sanitizePlainText(title).slice(0, 255),
        description: description ? (await sanitizeHtml(description)).slice(0, 5000) : null,
        due_date,
        status: "todo",
        priority: "medium",
        client_id: client_id || null,
        created_by: created_by || null,
      })
      .select("id")
      .single();

    if (taskError) {
      console.error("[API calendar/create-task] Task insert error:", taskError);
      return NextResponse.json(
        { error: "Failed to create task", details: taskError.message },
        { status: 500 }
      );
    }

    const taskId = taskData?.id;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID not returned" }, { status: 500 });
    }

    // Step 2: Assign PM via task_assignees
    const { error: assignErr } = await supabaseAdmin
      .from("task_assignees")
      .insert({
        task_id: taskId,
        user_id: pm_user_id,
      });

    if (assignErr) {
      console.error("[API calendar/create-task] Assign error:", assignErr);
      // Task created but assign failed — return partial success
      return NextResponse.json({
        success: true,
        task_id: taskId,
        warning: "Task created but failed to assign PM. Assign manually.",
      });
    }

    // Step 3: Link task back to calendar event if event_id provided
    if (event_id) {
      await supabaseAdmin
        .from("calendar_events")
        .update({ linked_task_id: taskId })
        .eq("id", event_id);
    }

    // Step 4: Send in-app notification to PM
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: pm_user_id,
        type: "meeting_assignment",
        title: "📅 Meeting baru dari AE",
        body: `Anda di-assign untuk meeting: ${sanitizePlainText(title).slice(0, 100)}. Cek task detail untuk info lengkap.`,
        link: "/tasks",
      });
    } catch {
      // Non-critical — don't fail the request if notification fails
    }

    return NextResponse.json({
      success: true,
      task_id: taskId,
      message: "Task created and assigned successfully",
    });
  } catch (err) {
    console.error("[API calendar/create-task] Exception:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}