-- ═══════════════════════════════════════════════════════════════════
-- v108e — RECREATE 2 fungsi RPC yang error 42P01 (stale plan cache)
--
-- Fakta (diagnosa v108d + probe REST 18:17):
--   • Definisi fungsi SUDAH benar: SET search_path = public, extensions
--   • Tabel chat_messages/profiles ADA & terbaca REST (HTTP 200)
--   • Tapi RPC via REST tetap 42P01 → plan cache basi di PostgREST
--
-- Solusi definitif: DROP + CREATE (OID baru ⇒ semua cached plan gugur).
-- Sekaligus re-apply GRANT/REVOKE v108 (DROP+CREATE mengembalikan grant
-- default PUBLIC yang sudah kita cabut — WAJIB di-cabut lagi di sini).
-- ═══════════════════════════════════════════════════════════════════

-- 1. get_chat_unread_total (badge notif chat)
DROP FUNCTION IF EXISTS public.get_chat_unread_total(uuid);
CREATE FUNCTION public.get_chat_unread_total(p_user_id uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  select count(*)::integer
  from chat_messages m
  join chat_channel_members cm on cm.channel_id = m.channel_id and cm.user_id = p_user_id
  left join chat_read_receipts rr on rr.channel_id = m.channel_id and rr.user_id = p_user_id
  where m.user_id <> p_user_id
    and m.deleted_at is null
    and (rr.last_read_at is null or m.created_at > rr.last_read_at);
$$;

-- 2. get_user_divisions (helper pembagian divisi user)
DROP FUNCTION IF EXISTS public.get_user_divisions();
CREATE FUNCTION public.get_user_divisions()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN division IS NOT NULL THEN ARRAY[division]
    ELSE ARRAY[]::TEXT[]
  END
  FROM profiles WHERE id = auth.uid();
$$;

-- 3. Re-apply kebijakan v108 (jangan biarkan anon mengeksekusi)
REVOKE EXECUTE ON FUNCTION public.get_chat_unread_total(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_divisions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_unread_total(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_divisions() TO authenticated, service_role;

-- 4. Tes langsung level DB (harus 0/[] bukan error) + reload PostgREST
SELECT public.get_chat_unread_total('00000000-0000-0000-0000-000000000000'::uuid) AS tes_chat;
NOTIFY pgrst, 'reload schema';
