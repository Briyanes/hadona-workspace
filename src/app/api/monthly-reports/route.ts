import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
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
}

// GET /api/monthly-reports?client_id=&year=&month=&task_id=
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  let query = supabase
    .from("monthly_reports")
    .select(
      `*,
      client:clients(id, name),
      task:tasks(id, title, status),
      creator:profiles!monthly_reports_created_by_fkey(id, full_name)`
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  const clientId = params.get("client_id");
  if (clientId) query = query.eq("client_id", clientId);

  const year = params.get("year");
  if (year) query = query.eq("period_year", Number(year));

  const month = params.get("month");
  if (month) query = query.eq("period_month", Number(month));

  const taskId = params.get("task_id");
  if (taskId) query = query.eq("task_id", taskId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/monthly-reports — simpan metadata file yang sudah diupload
export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { client_id, task_id, period_month, period_year, file_url, file_key, file_name, file_size, notes } = body;

  if (!period_month || !period_year || !file_url) {
    return NextResponse.json(
      { error: "period_month, period_year, dan file_url wajib diisi" },
      { status: 400 }
    );
  }

  // Cek duplikat (client + periode)
  let dupQuery = supabase
    .from("monthly_reports")
    .select("id")
    .eq("period_month", period_month)
    .eq("period_year", period_year);

  if (client_id) {
    dupQuery = dupQuery.eq("client_id", client_id);
  } else {
    dupQuery = dupQuery.is("client_id", null);
  }

  const { data: existing } = await dupQuery.maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Report untuk client & periode ini sudah ada. Hapus dulu jika ingin upload ulang." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("monthly_reports")
    .insert({
      client_id: client_id || null,
      task_id: task_id || null,
      period_month,
      period_year,
      file_url,
      file_key: file_key || null,
      file_name: file_name || null,
      file_size: file_size || null,
      notes: notes || null,
      status: "submitted",
      created_by: user.id,
    } as never)
    .select(
      `*,
      client:clients(id, name),
      task:tasks(id, title, status),
      creator:profiles!monthly_reports_created_by_fkey(id, full_name)`
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-complete task jika task_id diisi dan task belum done
  if (task_id) {
    await supabase
      .from("tasks")
      .update({ status: "done", result: "Monthly report uploaded" } as never)
      .eq("id", task_id)
      .neq("status", "done");
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/monthly-reports — update status/notes
export async function PATCH(request: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, status, notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (notes !== undefined) update.notes = notes;

  const { data, error } = await supabase
    .from("monthly_reports")
    .update(update as never)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/monthly-reports?id=
export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }

  // Ambil file_key untuk hapus file di storage
  const { data: report } = await supabase
    .from("monthly_reports")
    .select("file_key")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report tidak ditemukan" }, { status: 404 });
  }

  const { error } = await supabase.from("monthly_reports").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Hapus file dari storage (best-effort)
  const fileKey = (report as { file_key: string | null }).file_key;
  if (fileKey) {
    await supabase.storage.from("monthly-reports").remove([fileKey]);
  }

  return NextResponse.json({ success: true });
}