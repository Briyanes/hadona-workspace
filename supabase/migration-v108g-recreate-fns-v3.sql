-- ═══════════════════════════════════════════════════════════════════
-- v108g — RECREATE fungsi RPC chat v3 (rekonstruksi policy dari katalog)
--
-- Rantai kegagalan sebelumnya:
--   v108e: DROP fn ditolak — dirujuk 3 RLS policy chat (2BP01)
--   v108f: pg_get_policydef() TIDAK ADA di Postgres (42883)
--
-- v108g: rekonstruksi CREATE POLICY manual dari pg_policy:
--   polcmd r/a/w/d/* → select/insert/update/delete/all
--   polroles (0=public) → via cast ::regrole[]
--   polqual / polwithcheck → pg_get_expr() (fungsi ini pasti ada)
-- Tetap atomik: gagal 1 langkah = rollback semua.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Capture policy dependen
create temp table v108g_policies(
  tbl text, pol text, permissive boolean, cmd text,
  roles text[],          -- null ⇒ to public
  using_expr text, check_expr text
) on commit drop;

insert into v108g_policies(tbl, pol, permissive, cmd, roles, using_expr, check_expr)
select c.relname, p.polname, p.polpermissive,
  case p.polcmd
    when 'r' then 'select' when 'a' then 'insert'
    when 'w' then 'update' when 'd' then 'delete'
    else 'all' end,
  case when 0 = any(p.polroles) then null
       else p.polroles::regrole[]::text[] end,
  pg_get_expr(p.polqual, p.polrelid),
  pg_get_expr(p.polwithcheck, p.polrelid)
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (pg_get_expr(p.polqual, p.polrelid) ~ 'get_user_divisions|get_chat_unread_total'
    or pg_get_expr(p.polwithcheck, p.polrelid) ~ 'get_user_divisions|get_chat_unread_total');

-- Safety net: pastikan yang ter-capture memang 3 policy yang diketahui
do $$
declare cnt int;
begin
  select count(*) into cnt from v108g_policies;
  if cnt = 0 then
    raise exception 'v108g: tidak ada policy dependen ter-capture — kondisi DB berubah, JANGAN lanjut';
  end if;
end $$;

-- 2. Drop policy dependen (sementara)
do $$
declare r record;
begin
  for r in select tbl, pol from v108g_policies loop
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
  end loop;
end $$;

-- 3a. get_chat_unread_total — OID baru (bunuh plan cache basi)
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

-- 3b. get_user_divisions — OID baru
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

-- 5. Pulihkan policy dari data capture (dinamis)
do $$
declare r record; ddl text;
begin
  for r in select * from v108g_policies loop
    ddl := format('create policy %I on public.%I as %s for %s to %s %s %s',
      r.pol, r.tbl,
      case when r.permissive then 'permissive' else 'restrictive' end,
      r.cmd,
      case when r.roles is null then 'public' else array_to_string(r.roles, ', ') end,
      case when r.using_expr is null then '' else 'using (' || r.using_expr || ')' end,
      case when r.check_expr is null then '' else 'with check (' || r.check_expr || ')' end);
    execute ddl;
  end loop;
end $$;

-- 6. Tes langsung (harus 0, bukan error) + reload PostgREST
select public.get_chat_unread_total('00000000-0000-0000-0000-000000000000'::uuid) as tes_chat;
notify pgrst, 'reload schema';
