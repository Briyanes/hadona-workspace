-- Migration v104: Fix chat & mention notifications + configurable push relay
-- FIXES v103 bugs:
--   1. notify_chat_members() inserted with WRONG columns (message/read —
--      tabel notifications punya body/is_read) → runtime error → notif chat
--      tidak pernah terbuat. Sekarang: kolom benar + mention-aware.
--   2. Relay trigger memakai placeholder __RELAY_URL__/__RELAY_SECRET__ yang
--      harus di-inject manual — sekarang dibaca dari tabel push_config
--      (diisi via REST oleh scripts/run-migration-v104.mjs, tanpa secret di SQL).
-- Idempotent — aman dijalankan berulang.

-- ============================================================
-- 1. PUSH_CONFIG — konfigurasi relay (URL + secret)
--    Diisi oleh scripts/run-migration-v104.mjs via service key.
--    RLS tanpa policy → hanya service role / SQL editor yang bisa akses.
-- ============================================================
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  relay_url text not null default '',
  relay_secret text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.push_config enable row level security;

insert into public.push_config (id) values (true) on conflict (id) do nothing;

-- ============================================================
-- 2. PUSH RELAY TRIGGER — baca config dari push_config
--    Setiap INSERT ke notifications → POST ke /api/push/relay (Vercel)
-- ============================================================
create or replace function public.notify_push_relay()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select relay_url, relay_secret into v_url, v_secret
  from public.push_config where id;

  -- Belum dikonfigurasi → skip senyap (jangan gagalkan INSERT notifikasi)
  if v_url is null or v_url = '' then
    return NEW;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Relay-Secret', v_secret
      ),
      body := jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'type', NEW.type,
        'title', NEW.title,
        'body', NEW.body,
        'link', NEW.link
      ),
      timeout_milliseconds := 5000
    );
  end if;
  return NEW;
exception when others then
  raise warning 'notify_push_relay failed: %', sqlerrm;
  return NEW;
end;
$$;

drop trigger if exists trg_notifications_push_relay on public.notifications;
create trigger trg_notifications_push_relay
  after insert on public.notifications
  for each row execute function public.notify_push_relay();

-- ============================================================
-- 3. NOTIF CHAT — FIXED
--    INSERT chat_messages →
--      a) chat_mention utk user yang di-mention (prioritas)
--      b) chat_message utk member lain (yang TIDAK di-mention)
--    Kolom BENAR: body & is_read (v103 salah: message & read).
--    Wrapped dalam exception → notif gagal TIDAK menggagalkan pesan chat.
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
begin
  if new.user_id is null then return new; end if;

  -- Hanya pesan teks yang generate notif
  if new.message_type is not null and new.message_type not in ('text') then
    return new;
  end if;

  select coalesce(full_name, email) into sender_name
  from profiles where id = new.user_id;
  select name into channel_name from chat_channels where id = new.channel_id;

  -- a) Mention notifications (paritas dgn route lama: semua yang di-mention,
  --    kecuali pengirim)
  insert into notifications (user_id, type, title, body, link, is_read, created_at)
  select
    m,
    'chat_mention',
    '💬 ' || coalesce(sender_name, 'Seseorang') || ' menyebut Anda di chat',
    left(coalesce(new.content, ''), 100) || ' — buka chat untuk membalas.',
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
    left(coalesce(new.content, ''), 120),
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

drop trigger if exists trg_notify_chat_members on public.chat_messages;
create trigger trg_notify_chat_members
  after insert on public.chat_messages
  for each row execute function public.notify_chat_members();

-- ============================================================
-- 4. BERSIHKAN notif chat_mention duplikat/kosong warisan lama (opsional)
--    Hapus baris chat_message/chat_mention yang link-nya tidak /chat
--    (tidak ada — hanya jaga-jaga). Tidak menghapus data apa pun.
-- ============================================================