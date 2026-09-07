-- ═══════════════════════════════════════════════════════════════════
-- v108f — RECREATE fungsi RPC chat TANPA konflik RLS policy
--
-- Pelajaran v108e: get_user_divisions() dirujuk 3 RLS policy chat
-- (channels_select_policy, messages_select_policy, messages_insert_policy)
-- → DROP ditolak (2BP01) → seluruh transaksi rollback.
--
-- Strategi (semua dalam SATU transaksi — atomik):
--   1. Capture definisi semua policy yang merujuk kedua fungsi (pg_get_policydef)
--   2. DROP policy dependen (sementara)
--   3. DROP + CREATE kedua fungsi (OID baru ⇒ plan cache basi gugur)
--   4. REVOKE PUBLIC/anon + GRANT authenticated, service_role
--   5. Pulihkan policy persis seperti semula
--   6. Tes + reload PostgREST
-- ═══════════════════════════════════════════════════════════════════

-- 1. Capture policy dependen (dinamis, tanpa hardcode)
create temp table v108f_policies(tbl text, pol text, def text) on commit drop;
insert into v108f_policies(tbl, pol, def)
select c.relname, p.polname, pg_get_policydef(p.oid)
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and pg_get_policydef(p.oid) ~ 'get_user_divisions|get_chat_unread_total';

-- 2. Drop policy dependen
do $$
declare r record;
begin
  for r in select tbl, pol from v108f_policies loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
  end loop;
end $$;

-- 3a. get_chat_unread_total (OID baru)
drop function if exists public.get_chat_unread_total(uuid);
create function public.get_chat_unread_total(p_user_id uuid default auth.uid())
returns integer
language sql stable security definer
set search_path = public, extensions
as $$
  select count(*)::integer
  from chat_messages m
  join chat_channel_members cm on cm.channel_id = m.channel_id and cm.user_id = p_user_id
  left join chat_read_receipts rr on rr.channel_id = m.channel_id and rr.user_id = p_user_id
  where m.user_id <> p_user_id
    and m.deleted_at is null
    and (rr.last_read_at is null or m.created_at > rr.last_read_at);
$$;

-- 3b. get_user_divisions (OID baru)
drop function if exists public.get_user_divisions();
create function public.get_user_divisions()
returns text[]
language sql stable security definer
set search_path = public, extensions
as $$
  select case
    when division is not null then array[division]
    else array[]::text[]
  end
  from profiles where id = auth.uid();
$$;

-- 4. Kunci akses (DROP+CREATE mengembalikan grant default PUBLIC!)
revoke execute on function public.get_chat_unread_total(uuid) from public, anon;
revoke execute on function public.get_user_divisions() from public, anon;
grant execute on function public.get_chat_unread_total(uuid) to authenticated, service_role;
grant execute on function public.get_user_divisions() to authenticated, service_role;

-- 5. Pulihkan policy persis seperti semula
do $$
declare r record;
begin
  for r in select def from v108f_policies loop
    execute r.def;
  end loop;
end $$;

-- 6. Tes langsung (harus 0, bukan error) + reload PostgREST
select public.get_chat_unread_total('00000000-0000-0000-0000-000000000000'::uuid) as tes_chat;
notify pgrst, 'reload schema';
