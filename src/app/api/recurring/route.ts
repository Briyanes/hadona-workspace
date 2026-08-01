import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// POST /api/recurring/process — generate due recurring tasks
export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check manager permission
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role: string } | null)?.role;
  if (role !== "super_admin" && role !== "project_manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date().toISOString().split("T")[0];

  // Get all active recurring tasks that are due
  const { data: dueTasks, error: fetchError } = await supabase
    .from("recurring_tasks")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_date", today);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const results: Array<{ title: string; success: boolean; error?: string }> = [];

  for (const rt of dueTasks || []) {
    // Create task from template
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + rt.due_in_days);

    const { data: newTask, error: taskError } = await supabase
      .from("tasks")
      .insert({
        title: rt.template_title,
        description: rt.template_description,
        priority: rt.template_priority,
        division: rt.template_division,
        result: rt.template_result,
        client_id: rt.client_id,
        due_date: dueDate.toISOString().split("T")[0],
        created_by: rt.created_by,
      } as never)
      .select("id")
      .single();

    if (taskError) {
      results.push({ title: rt.template_title, success: false, error: taskError.message });
      continue;
    }

    const taskId = (newTask as { id: string }).id;

    // Assign to assignee_ids
    if (rt.assignee_ids && rt.assignee_ids.length > 0) {
      const assigneeRows = rt.assignee_ids.map((uid: string) => ({
        task_id: taskId,
        user_id: uid,
      }));
      await supabase.from("task_assignees").insert(assigneeRows as never);
    }

    // Calculate next run date
    let nextDate = today;
    if (rt.frequency === "daily") {
      nextDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    } else if (rt.frequency === "weekly") {
      const days = ((rt.day_of_week - new Date().getDay() + 7) % 7) || 7;
      nextDate = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
    } else if (rt.frequency === "monthly") {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(rt.day_of_month, 28));
      nextDate = d.toISOString().split("T")[0];
    } else if (rt.frequency === "quarterly") {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      d.setDate(Math.min(rt.day_of_month, 28));
      nextDate = d.toISOString().split("T")[0];
    }

    // Update recurring task
    await supabase
      .from("recurring_tasks")
      .update({
        last_run_at: new Date().toISOString(),
        last_task_id: taskId,
        next_run_date: nextDate,
      } as never)
      .eq("id", rt.id);

    results.push({ title: rt.template_title, success: true });
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}

// GET /api/recurring — list all recurring tasks
export async function GET(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("recurring_tasks")
    .select(
      `*,
      client:clients(name),
      creator:profiles(full_name)`
    )
    .order("next_run_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}