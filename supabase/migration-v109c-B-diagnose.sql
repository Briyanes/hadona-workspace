-- ═══════════════════════════════════════════════════════════════════
-- v109c File B — DIAGNOSTIK READ-ONLY (jalankan SETELAH File A sukses)
-- Semua query SELECT — tidak mengubah apa pun. Paste SEMUA grid hasil.
-- ═══════════════════════════════════════════════════════════════════

-- Q1. Apakah task_assignees ada? di schema mana? bentuk apa?
select n.nspname as schema, c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('task_assignees', 'notifications', 'tasks');

-- Q2. Kolom task_assignees (jika ada)
select column_name, data_type
from information_schema.columns
where table_name = 'task_assignees' order by ordinal_position;

-- Q3. Trigger aktif di tasks + fungsi yang dipakai
select t.tgname, p.proname as fungsi,
       coalesce(array_to_string(p.proconfig, ', '), '(TIDAK ter-pin)') as search_path_fn
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
where c.relname = 'tasks' and not t.tgisinternal;

-- Q4. Trigger di task_assignees (trg_task_assigned v24 — akan error jika tabel tak ada)
select t.tgname, p.proname as fungsi
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
where c.relname = 'task_assignees' and not t.tgisinternal;

-- Q5. Isi task_assignees (jumlah baris)
select count(*) as jumlah_baris_task_assignees from task_assignees;

-- Q6. Kondisi RLS task_assignees
select relname, relrowsecurity as rls_aktif
from pg_class where relname = 'task_assignees';
