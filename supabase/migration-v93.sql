-- ============================================================
-- Migration v93: Fix grup chat tidak muncul di sidebar
-- ============================================================
-- Root cause:
--   RLS members_insert (auth.uid() = user_id) menolak batch insert
--   (owner + member lain) → membership kosong → GET filter
--   menyembunyikan grup private → grup tidak muncul di sidebar.
--
-- Fix:
--   1. RLS members_insert: creator grup BOLEH insert member lain
--   2. Backfill: owner untuk grup yang sudah terlanjur tanpa membership
--   3. RLS members_update: owner boleh mengubah role member
-- ============================================================

-- 1. Fix RLS members_insert — creator grup boleh menambahkan orang lain
drop policy if exists "members_insert" on public.chat_channel_members;
create policy "members_insert" on public.chat_channel_members
  for insert with check (
    auth.uid() = user_id
    or exists (
      select 1 from public.chat_channels c
      where c.id = channel_id
        and c.created_by = auth.uid()
    )
  );

-- 2. Fix RLS members_delete — creator/owner grup boleh mengeluarkan member
--    (policy lama hanya cek ownership via tabel yang sama, berpotensi rekursif/salah)
drop policy if exists "members_delete" on public.chat_channel_members;
create policy "members_delete" on public.chat_channel_members
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from public.chat_channels c
      where c.id = channel_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.chat_channel_members m2
      where m2.channel_id = chat_channel_members.channel_id
        and m2.user_id = auth.uid()
        and m2.role = 'owner'
    )
  );

-- 3. RLS members_update — owner boleh ubah role member (mis. promote)
drop policy if exists "members_update" on public.chat_channel_members;
create policy "members_update" on public.chat_channel_members
  for update using (
    exists (
      select 1 from public.chat_channels c
      where c.id = channel_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.chat_channel_members m2
      where m2.channel_id = chat_channel_members.channel_id
        and m2.user_id = auth.uid()
        and m2.role = 'owner'
    )
  );

-- 4. Backfill: owner untuk SEMUA grup yang belum punya membership creator
--    (memperbaiki grup "cc" yang sudah terlanhur dibuat tanpa member)
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
