-- ═══════════════════════════════════════════════════════════════════
-- v108d — DIAGNOSIS + REPAIR search_path (gabung, tanpa rollback massal)
-- Output: 1 grid hasil — paste SEMUA ke tim dev.
-- ═══════════════════════════════════════════════════════════════════
create temp table v108d_results(k text, v text);

-- A. Info role
insert into v108d_results
select 'ROLE', current_user || ' | member supabase_admin=' ||
  pg_has_role(current_user,'supabase_admin','MEMBER')::text ||
  ' | member service_role=' || pg_has_role(current_user,'service_role','MEMBER')::text;

-- B. Kondisi AWAL fungsi app yang belum ter-pin
insert into v108d_results
select 'BEFORE', p.oid::regprocedure::text || ' → ' ||
  coalesce(array_to_string(p.proconfig,', '),'(tanpa config)') ||
  ' | owner=' || pg_get_userbyid(p.proowner)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
where n.nspname='public' and p.prokind='f' and d.objid is null
  and (p.proconfig is null or not exists (
       select 1 from unnest(p.proconfig) c where c ilike 'search_path=%'));

-- C. Pin per-fungsi — kegagalan dicatat, TIDAK menggagalkan yang lain
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn, pg_get_userbyid(p.proowner) as owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname='public' and p.prokind='f' and d.objid is null
      and (p.proconfig is null or not exists (
           select 1 from unnest(p.proconfig) c where c ilike 'search_path=%'))
  loop
    begin
      execute format('alter function %s set search_path = %L', r.fn, 'public, extensions');
      insert into v108d_results values ('PINNED', r.fn::text);
    exception when others then
      insert into v108d_results values ('PIN-FAIL', r.fn::text ||
        ' (owner=' || r.owner || '): ' || sqlerrm);
    end;
  end loop;
end $$;

-- D. Definisi PENUH 2 fungsi kritis (ground truth)
insert into v108d_results
select 'DEF', pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('get_chat_unread_total','get_user_divisions');

-- E. Force reload PostgREST
notify pgrst, 'reload schema';

select * from v108d_results;
