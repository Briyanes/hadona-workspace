-- ============================================================
-- Migration v92: Fix Chat Groups & DM — constraint + RLS
-- ============================================================
-- Bug: migration-v72 membuat CHECK (type IN ('general','division',
-- 'dm','announcement')) — 'group' tidak termasuk, padahal migration-v91
-- memperkenalkan channel type 'group'. Insert type='group' selalu gagal
-- dengan error: chat_channels_type_check.
--
-- Bug 2: RLS policies dari v72 hanya mengizinkan super_admin/PM insert,
-- dan member grup/partner DM tidak bisa melihat channel & baca pesan.
-- ============================================================

-- 1. Fix CHECK constraint: tambahkan 'group'
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('general', 'division', 'dm', 'announcement', 'group'));

-- ============================================================
-- 2. Fix RLS: chat_channels SELECT
--    - general/announcement: semua user
--    - division: hanya division-nya
--    - group: public (is_private=false), creator, atau member
--    - dm: kedua partisipan (nama channel = 'uuid1__uuid2')
-- ============================================================
DROP POLICY IF EXISTS "channels_select_policy" ON public.chat_channels;
CREATE POLICY "channels_select_policy" ON public.chat_channels
  FOR SELECT USING (
    type IN ('general', 'announcement')
    OR (type = 'division' AND division = ANY(get_user_divisions()))
    OR created_by = auth.uid()
    OR (
      type = 'group'
      AND (
        is_private = false
        OR EXISTS (
          SELECT 1 FROM public.chat_channel_members m
          WHERE m.channel_id = chat_channels.id
            AND m.user_id = auth.uid()
        )
      )
    )
    OR (
      type = 'dm'
      AND auth.uid() = ANY(string_to_array(name, '__'))
    )
  );

-- ============================================================
-- 3. Fix RLS: chat_channels INSERT
--    - super_admin/project_manager: boleh semua type
--    - user biasa: boleh bikin 'group' / 'dm' miliknya sendiri
-- ============================================================
DROP POLICY IF EXISTS "channels_insert_policy" ON public.chat_channels;
CREATE POLICY "channels_insert_policy" ON public.chat_channels
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'project_manager')
      )
      OR (
        created_by = auth.uid()
        AND type IN ('group', 'dm')
      )
    )
  );

-- ============================================================
-- 4. Fix RLS: chat_messages SELECT
--    akses channel sama dengan policy channels_select
-- ============================================================
DROP POLICY IF EXISTS "messages_select_policy" ON public.chat_messages;
CREATE POLICY "messages_select_policy" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = channel_id
      AND (
        c.type IN ('general', 'announcement')
        OR (c.type = 'division' AND c.division = ANY(get_user_divisions()))
        OR c.created_by = auth.uid()
        OR (
          c.type = 'group'
          AND (
            c.is_private = false
            OR EXISTS (
              SELECT 1 FROM public.chat_channel_members m
              WHERE m.channel_id = c.id
                AND m.user_id = auth.uid()
            )
          )
        )
        OR (
          c.type = 'dm'
          AND auth.uid() = ANY(string_to_array(c.name, '__'))
        )
      )
    )
  );

-- ============================================================
-- 5. Fix RLS: chat_messages INSERT
--    akses channel sama dengan policy messages_select
-- ============================================================
DROP POLICY IF EXISTS "messages_insert_policy" ON public.chat_messages;
CREATE POLICY "messages_insert_policy" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_channels c
      WHERE c.id = channel_id
      AND (
        c.type IN ('general', 'announcement')
        OR (c.type = 'division' AND c.division = ANY(get_user_divisions()))
        OR c.created_by = auth.uid()
        OR (
          c.type = 'group'
          AND (
            c.is_private = false
            OR EXISTS (
              SELECT 1 FROM public.chat_channel_members m
              WHERE m.channel_id = c.id
                AND m.user_id = auth.uid()
            )
          )
        )
        OR (
          c.type = 'dm'
          AND auth.uid() = ANY(string_to_array(c.name, '__'))
        )
      )
    )
  );