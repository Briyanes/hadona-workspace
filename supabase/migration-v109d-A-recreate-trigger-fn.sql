-- ═══════════════════════════════════════════════════════════════════
-- v109d File A — RECREATE create_notification + notify_task_status_change
--
-- Bukti eksekusi:
--  • v109b: error 42P01 task_assignees (KASUS 1) → create_notification
--    SUDAH resolve saat itu. Tapi rollback menghapusnya lagi.
--  • v109c-A: create_notification dibuat dulu di transaksi yang sama,
--    tapi trigger TETAP 42883 → fungsi trigger menyimpan plan/resolusi
--    lama (pola yang sama dengan kasus chat v108g).
--
-- Fix final (2 lapis):
--  1. create_notification — dibuat ulang (idempotent)
--  2. notify_task_status_change — DROP+CREATE (OID BARU → re-parse paksa
--     seluruh body, membunuh plan cache basi) + GUARD to_regclass utk
--     task_assignees (terbukti tidak ada — KASUS 1/2 skip tanpa crash)
--
-- Smoke test ada di FILE TERPISAH (v109d-B) supaya kegagalannya
-- tidak pernah me-rollback fix ini.
-- ═══════════════════════════════════════════════════════════════════

-- 1. create_notification (idempotent, pin search_path)
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

grant execute on function public.create_notification(uuid, text, text, text, text, jsonb)
  to authenticated, service_role;

-- bukti langsung fungsi terdaftar (harus menampilkan signature, bukan null)
select to_regprocedure('public.create_notification(uuid,text,text,text,text,jsonb)') as fn_terdaftar;

-- 2. notify_task_status_change — DROP + CREATE (OID baru = re-parse paksa)
drop trigger if exists trg_task_status on tasks;
drop function if exists public.notify_task_status_change();

create function public.notify_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $func$
declare
  v_actor uuid;
  v_has_assignees boolean := to_regclass('public.task_assignees') is not null;
begin
  if old.status is distinct from new.status then
    v_actor := auth.uid();

    -- KASUS 1 & 2: review/blocked → kabari semua assignee
    -- (hanya jika tabel task_assignees benar-benar ada)
    if new.status in ('review', 'blocked') and v_has_assignees then
      perform create_notification(
        ta.user_id,
        case when new.status = 'review' then 'task_review' else 'task_blocked' end,
        case when new.status = 'review' then 'Task Perlu Review' else 'Task Diblokir' end,
        'Task "' || new.title || '" dipindahkan ke ' || new.status,
        '/tasks',
        jsonb_build_object('task_id', new.id, 'status', new.status)
      )
      from task_assignees ta
      where ta.task_id = new.id
        and ta.user_id is distinct from v_actor
        and ta.user_id is distinct from new.created_by;
    end if;

    -- KASUS 3 (semua perubahan status): kabari creator
    if new.created_by is not null and new.created_by is distinct from v_actor then
      perform create_notification(
        new.created_by,
        'task_updated',
        'Status Task Diperbarui',
        new.title || ' → ' || new.status,
        '/tasks',
        jsonb_build_object('task_id', new.id, 'status', new.status)
      );
    end if;
  end if;

  return new;
end;
$func$;

-- 3. Trigger ulang (nama & event sama dengan v106)
create trigger trg_task_status
  after update of status on tasks
  for each row
  execute procedure public.notify_task_status_change();

-- 4. Reload PostgREST
notify pgrst, 'reload schema';
