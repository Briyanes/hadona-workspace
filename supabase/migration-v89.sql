-- Migration v89 — Content Plans: reset "Proses Edit" lama → "Draft" + index link task
-- CATATAN: link plan↔task editor TIDAK memakai kolom baru (content_plans.task_id),
-- melainkan konvensi tasks.sheet_row_id = 'content_plan:<plan_id>' (kolom sudah ada).
-- Migration ini opsional untuk performa; fitur sudah berfungsi tanpanya.

-- 1) Index agar pencarian task editor by sheet_row_id cepat (skip jika sudah ada)
create index if not exists idx_tasks_sheet_row_id on tasks (sheet_row_id);

-- 2) Data lama: plan yang macet di "Proses Edit" tanpa task editor → kembali ke Draft
update content_plans
set progress = 'Draft'
where lower(coalesce(progress, '')) in ('proses edit', 'proses_edit', 'editing', 'on edit')
  and not exists (
    select 1 from tasks t
    where t.sheet_row_id = 'content_plan:' || content_plans.id::text
  );

-- 3) (Opsional, di masa depan) kolom task_id resmi — saat ini TIDAK dipakai app:
-- alter table content_plans add column if not exists task_id uuid references tasks(id) on delete set null;