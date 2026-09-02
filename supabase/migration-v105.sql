-- Migration v105: Sanitasi mention @[Nama](uuid) di body notifikasi chat
-- FIXES v104 cosmetic bug: konten chat menyimpan mention sebagai
--   @[Briyanes Work Hard](f4908dd5-0070-41c1-81ce-9622b4b8c36c)
-- UI chat merendernya jadi @Briyanes Work Hard, tapi trigger v104 memakai
-- konten MENTAH untuk body notif → UUID ikut tampil di push HP & lonceng notif.
--
-- Solusi: regexp_replace @[Nama](uuid) → @Nama SEBELUM insert notif.
-- Plus: bersihkan notif lama yang body-nya masih mengandung UUID mention.
--
-- Idempotent — aman dijalankan berulang.

-- ============================================================
-- 1. REPLACE FUNCTION notify_chat_members() — body disanitasi
--    (signature sama → trigger tetap ter-bind, tak perlu recreate)
-- ============================================================
create or replace function public.notify_chat_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  channel_name text;
  clean_body text;
begin
  if new.user_id is null then return new; end if;

  -- Hanya pesan teks yang generate notif
  if new.message_type is not null and new.message_type not in ('text') then
    return new;
  end if;

  select coalesce(full_name, email) into sender_name
  from profiles where id = new.user_id;
  select name into channel_name from chat_channels where id = new.channel_id;

  -- Sanitasi mention: @[Nama](uuid) → @Nama (global, case-insensitive hex)
  clean_body := regexp_replace(
    coalesce(new.content, ''),
    '@\[([^\]]+)\]\([0-9a-fA-F][0-9a-fA-F-]*\)',
    '@\1',
    'g'
  );

  -- a) Mention notifications (paritas dgn route lama: semua yang di-mention,
  --    kecuali pengirim)
  insert into notifications (user_id, type, title, body, link, is_read, created_at)
  select
    m,
    'chat_mention',
    '💬 ' || coalesce(sender_name, 'Seseorang') || ' menyebut Anda di chat',
    left(clean_body, 100) || ' — buka chat untuk membalas.',
    '/chat',
    false,
    new.created_at
  from unnest(coalesce(new.mentions, '{}'::uuid[])) as m
  where m <> new.user_id;

  -- b) Notif umum utk member channel lain (yang TIDAK di-mention —
  --    hindari double-notify)
  insert into notifications (user_id, type, title, body, link, is_read, created_at)
  select
    cm.user_id,
    'chat_message',
    coalesce(sender_name, 'Seseorang') || ' · ' || coalesce(channel_name, 'Chat'),
    left(clean_body, 120),
    '/chat',
    false,
    new.created_at
  from chat_channel_members cm
  where cm.channel_id = new.channel_id
    and cm.user_id is not null
    and cm.user_id <> new.user_id
    and not (cm.user_id = any(coalesce(new.mentions, '{}'::uuid[])));

  return new;
exception when others then
  raise warning 'notify_chat_members failed: %', sqlerrm;
  return new;
end;
$$;

-- ============================================================
-- 2. BERSIHKAN notif lama yang body-nya masih mengandung UUID mention
--    (hanya baris chat_mention/chat_message — tidak menyentuh tipe lain)
-- ============================================================
update notifications
set body = regexp_replace(
  body,
  '@\[([^\]]+)\]\([0-9a-fA-F][0-9a-fA-F-]*\)',
  '@\1',
  'g'
)
where type in ('chat_mention', 'chat_message')
  and body ~ '@\[[^\]]+\]\([0-9a-fA-F][0-9a-fA-F-]*\)';