-- ============================================================
-- Migration v91: Chat v2 — User Groups + Group Calls (Jitsi)
-- ============================================================
-- 1. chat_channel_members: membership untuk grup private
-- 2. chat_channel_calls: tracking group call aktif per channel
-- 3. Channel type baru: 'group' (dibuat user, private by default)
-- ============================================================

-- 1. Channel members table
create table if not exists public.chat_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (channel_id, user_id)
);

create index if not exists idx_chat_channel_members_channel
  on public.chat_channel_members(channel_id);
create index if not exists idx_chat_channel_members_user
  on public.chat_channel_members(user_id);

-- 2. Channel calls table (Jitsi group call tracking)
create table if not exists public.chat_channel_calls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  started_by uuid not null references public.profiles(id),
  jitsi_room text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_chat_channel_calls_channel
  on public.chat_channel_calls(channel_id);
create index if not exists idx_chat_channel_calls_active
  on public.chat_channel_calls(channel_id, ended_at) where ended_at is null;

-- 3. Add member_count / is_private columns ke chat_channels (graceful)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'chat_channels' and column_name = 'is_private'
  ) then
    alter table public.chat_channels add column is_private boolean not null default false;
  end if;
end $$;

-- 4. Enable RLS
alter table public.chat_channel_members enable row level security;
alter table public.chat_channel_calls enable row level security;

-- 5. RLS policies — chat_channel_members
drop policy if exists "members_select" on public.chat_channel_members;
create policy "members_select" on public.chat_channel_members
  for select using (true);

drop policy if exists "members_insert" on public.chat_channel_members;
create policy "members_insert" on public.chat_channel_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "members_delete" on public.chat_channel_members;
create policy "members_delete" on public.chat_channel_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.chat_channel_members m2
      where m2.channel_id = chat_channel_members.channel_id
        and m2.user_id = auth.uid()
        and m2.role = 'owner'
    )
  );

-- 6. RLS policies — chat_channel_calls
drop policy if exists "calls_select" on public.chat_channel_calls;
create policy "calls_select" on public.chat_channel_calls
  for select using (true);

drop policy if exists "calls_insert" on public.chat_channel_calls;
create policy "calls_insert" on public.chat_channel_calls
  for insert with check (auth.uid() = started_by);

drop policy if exists "calls_update" on public.chat_channel_calls;
create policy "calls_update" on public.chat_channel_calls
  for update using (
    auth.uid() = started_by
    or exists (
      select 1 from public.chat_channel_calls c2
      where c2.id = chat_channel_calls.id and c2.started_by = auth.uid()
    )
  );

-- 7. Realtime publication untuk tabel baru
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_channel_calls;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_channel_members;
  exception when others then null;
  end;
end $$;

-- 8. Seed: owner otomatis untuk channel 'group' yang sudah ada (jika ada)
insert into public.chat_channel_members (channel_id, user_id, role)
select c.id, c.created_by, 'owner'
from public.chat_channels c
where c.type = 'group'
  and c.created_by is not null
  and not exists (
    select 1 from public.chat_channel_members m
    where m.channel_id = c.id and m.user_id = c.created_by
  )
on conflict do nothing;