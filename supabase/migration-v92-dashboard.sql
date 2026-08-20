-- ============================================================
-- MIGRATION v92 (DASHBOARD VERSION) — Fix Chat Groups & DM
-- ============================================================
-- ⚠️ PENTING — SEBELUM RUN, PASTIKAN ANDA DI PROJECT YANG BENAR:
--    URL browser harus mengandung: rsxqjjcuixdsmijhgdyl
--    (Supabase Dashboard → project "Team Work Hadona" / workspace.hadona.id)
--
-- FIX v2: error "operator does not exist: uuid = text" terjadi karena
-- auth.uid() (uuid) dibandingkan dengan string_to_array() (text[]).
-- Solusi: cast auth.uid()::text pada semua klausa DM.
--
-- Cara pakai:
--   1. Buka https://supabase.com/dashboard/project/rsxqjjcuixdsmijhgdyl/sql/new
--   2. Paste SEMUA isi file ini (Ctrl/Cmd+A di editor SQL lalu paste)
--   3. Klik RUN (jangan select sebagian — jalankan semua)
--   4. Bagian paling bawah akan menampilkan hasil verifikasi:
--      harus terlihat ...'group'... pada kolom constraint_def
-- ============================================================

BEGIN;

-- 1. Fix CHECK constraint: tambahkan 'group'
ALTER TABLE public.chat_channels
  DROP CONSTRAINT IF EXISTS chat_channels_type_check;

ALTER TABLE public.chat_channels
  ADD CONSTRAINT chat_channels_type_check
  CHECK (type IN ('general', 'division', 'dm', 'announcement', 'group'));

-- 2. Fix RLS: chat_channels SELECT
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
      AND auth.uid()::text = ANY(string_to_array(name, '__'))
    )
  );

-- 3. Fix RLS: chat_channels INSERT
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

-- 4. Fix RLS: chat_messages SELECT
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
          AND auth.uid()::text = ANY(string_to_array(c.name, '__'))
        )
      )
    )
  );

-- 5. Fix RLS: chat_messages INSERT
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
          AND auth.uid()::text = ANY(string_to_array(c.name, '__'))
        )
      )
    )
  );

COMMIT;

-- ============================================================
-- VERIFIKASI (muncul sebagai hasil query di bawah)
-- Harus terlihat 'group' di constraint_def
-- ============================================================
SELECT current_database() AS database,
       conname AS constraint_name,
       pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'public.chat_channels'::regclass
  AND contype = 'c'
ORDER BY conname;