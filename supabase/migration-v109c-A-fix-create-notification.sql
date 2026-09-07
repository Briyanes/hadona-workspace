-- ═══════════════════════════════════════════════════════════════════
-- v109c File A — FIX INTI create_notification (JALANKAN INI DULU)
--
-- Riwayat: v109 (42804 enum) & v109b (42P01 task_assignees) keduanya
-- gagal di SMOKE TEST-nya sendiri → SQL Editor rollback seluruh file →
-- fix ikut ter-rollbacks dan tidak pernah applied.
--
-- v109c-A: fix inti SAJA + smoke test yang meniru persis aksi user
-- (drag ke in_progress → KASUS 3 trigger, TIDAK menyentuh
-- task_assignees). Setelah file ini sukses, drag ke In Progress/Done
-- langsung pulih. Masalah task_assignees ditangani file terpisah.
-- ═══════════════════════════════════════════════════════════════════

-- 1. FIX: pulihkan/tegaskan definisi v24 (6 argumen) + pin search_path
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

-- 2. Grant
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb)
  to authenticated, service_role;

-- 3. SMOKE TEST — flip ke in_progress lalu kembali (KASUS 3, mirip drag user)
begin;
create temp table v109c_smoke on commit drop as
  select id, status from tasks order by created_at desc limit 1;

update tasks
set status = 'in_progress'::task_status
where id = (select id from v109c_smoke)
  and status <> 'in_progress'::task_status;

update tasks set status = (select status from v109c_smoke)
where id = (select id from v109c_smoke);

select 'SMOKE OK — create_notification dipulihkan, KASUS 3 jalan' as hasil;
rollback;

-- 4. Verifikasi + reload PostgREST
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       coalesce(array_to_string(p.proconfig, ', '), '(tanpa config)') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_notification';

notify pgrst, 'reload schema';
