-- ═══════════════════════════════════════════════════════════════════
-- v109b — FIX create_notification (42883) + smoke test dgn cast enum
--
-- v109 gagal di bagian D (smoke test): tasks.status bertipe ENUM
-- task_status, CASE ... 'todo'/'review' menghasilkan text → 42804.
-- SQL Editor = 1 transaksi → seluruh v109 rollback, fix belum applied.
-- v109b: fix inti sama + cast eksplisit ::task_status di smoke test.
-- ═══════════════════════════════════════════════════════════════════

-- A. DIAGNOSTIK (sebelum)
select n.nspname as schema, p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'create_notification';

-- B. FIX: pulihkan/tegaskan definisi v24 (6 argumen) + pin search_path
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $func$
begin
  insert into notifications (user_id, type, title, body, link, metadata)
  values (p_user_id, p_type, p_title, p_body, p_link, p_metadata);
end;
$func$;

-- C. Grant
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb)
  to authenticated, service_role;

-- D. SMOKE TEST — semua nilai enum di-cast eksplisit ::task_status
begin;
create temp table v109b_smoke on commit drop as
  select id, status from tasks order by created_at desc limit 1;

update tasks
set status = case when status = 'review' then 'todo'::task_status
                  else 'review'::task_status end
where id = (select id from v109b_smoke);

update tasks set status = (select status from v109b_smoke)
where id = (select id from v109b_smoke);

select 'SMOKE OK — trigger & create_notification jalan tanpa error' as hasil,
       (select count(*) from v109b_smoke) as task_dites;
rollback;

-- E. DIAGNOSTIK (sesudah) + reload PostgREST
select n.nspname as schema, p.proname,
       coalesce(array_to_string(p.proconfig, ', '), '(tanpa config)') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_notification';

notify pgrst, 'reload schema';
