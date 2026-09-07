-- ═══════════════════════════════════════════════════════════════════
-- v109 — FIX: create_notification tidak ter-resolve (42883)
--
-- GEJALA: drag task di board → "Gagal update status:
--   function create_notification(uuid, unknown, unknown, text, unknown, jsonb)
--   does not exist"
-- SEBAB: trigger trg_task_status (v106) → notify_task_status_change()
--   memanggil create_notification(). Setelah v108c/g mem-pin search_path
--   trigger ke 'public, extensions', fungsi tsb TIDAK ditemukan →
--   kemungkinan tidak pernah ada di public (v24 tak ter-apply penuh)
--   atau berada di schema lain.
--
-- FIX (idempotent): pastikan public.create_notification ADA dengan
-- signature yang dipakai v106/v24, search_path ter-pin, grant benar.
-- ═══════════════════════════════════════════════════════════════════

-- A. DIAGNOSTIK (sebelum) — paste hasil grid ini jika masih error
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

-- C. Grant (trigger SECURITY DEFINER jalan sebagai owner — owner selalu boleh;
--    grant utk jalur RPC/API route lain)
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb)
  to authenticated, service_role;

-- D. SMOKE TEST (transaksi → ROLLBACK, tidak meninggalkan jejak)
--    Flip status 1 task → trigger v106 menyala → memanggil create_notification.
begin;
create temp table v109_smoke on commit drop as
  select id, status from tasks order by created_at desc limit 1;

update tasks
set status = case when status = 'review' then 'todo' else 'review' end
where id = (select id from v109_smoke);

-- kembalikan status semula (memicu trigger sekali lagi — double test)
update tasks set status = (select status from v109_smoke)
where id = (select id from v109_smoke);

select 'SMOKE OK — trigger & create_notification jalan tanpa error' as hasil,
       (select count(*) from v109_smoke) as task_dites;
rollback;

-- E. DIAGNOSTIK (sesudah) + reload PostgREST
select n.nspname as schema, p.proname,
       coalesce(array_to_string(p.proconfig, ', '), '(tanpa config)') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_notification';

notify pgrst, 'reload schema';
