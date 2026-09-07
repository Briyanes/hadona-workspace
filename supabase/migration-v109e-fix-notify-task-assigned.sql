-- ═══════════════════════════════════════════════════════════════════
-- v109e — FIX notify_task_assigned (bug kembar v109d)
--
-- Bukti eksekusi (E2E via REST service_role):
--  INSERT task_assignees → 42P01: relation "tasks" does not exist
--
-- Akar masalah:
--  notify_task_assigned() dibuat zaman v24 SEBAGAI SECURITY DEFINER
--  TANPA `SET search_path`. Role API Supabase jalan dengan search_path
--  kosong → fungsi tidak menemukan tabel `tasks` → SETIAP assign member
--  ke task gagal. (Pola identik dgn notify_task_status_change kemarin.)
--
-- Fix (pola terbukti v108g/v109d):
--  DROP TRIGGER + DROP FUNCTION → CREATE ulang (OID baru = re-parse
--  paksa, bunuh plan cache basi) + SET search_path dipin + semua
--  referensi schema-qualified (public.tasks, public.create_notification).
-- ═══════════════════════════════════════════════════════════════════

-- 1. DROP lama (trigger dulu, baru fungsi)
drop trigger if exists trg_task_assigned on public.task_assignees;
drop function if exists public.notify_task_assigned();

-- 2. CREATE ulang — search_path dipin, referensi schema-qualified
create function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $func$
declare
  v_task_title text;
  v_created_by uuid;
begin
  select title, created_by
    into v_task_title, v_created_by
    from public.tasks
   where id = new.task_id;

  if new.user_id is not null
     and (v_created_by is null or new.user_id is distinct from v_created_by) then
    perform public.create_notification(
      new.user_id,
      'task_assigned',
      'Task Baru Ditugaskan',
      v_task_title,
      '/tasks',
      jsonb_build_object('task_id', new.task_id)
    );
  end if;

  return new;
end;
$func$;

-- 3. Trigger ulang (nama & event sama dengan v24)
create trigger trg_task_assigned
  after insert on public.task_assignees
  for each row
  execute procedure public.notify_task_assigned();

-- 4. Reload PostgREST
notify pgrst, 'reload schema';
