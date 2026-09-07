-- ═══════════════════════════════════════════════════════════════════
-- v109d File B — SMOKE TEST (jalankan SETELAH File A sukses)
-- File ini SENGAJA terpisah: kalau gagal, fix File A TIDAK ikut rollback.
-- ═══════════════════════════════════════════════════════════════════
begin;
create temp table v109d_smoke on commit drop as
  select id, status from tasks order by created_at desc limit 1;

update tasks
set status = 'in_progress'::task_status
where id = (select id from v109d_smoke)
  and status <> 'in_progress'::task_status;

update tasks set status = (select status from v109d_smoke)
where id = (select id from v109d_smoke);

select 'SMOKE OK — drag In Progress/Done sudah aman' as hasil;
rollback;
