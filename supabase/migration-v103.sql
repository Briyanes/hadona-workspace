-- Migration v103: Push notification infrastructure (PWA) + chat unread RPC
-- 1. Tabel push_subscriptions (web-push endpoint per device)
-- 2. RPC get_chat_unread_total(uid) — badge unread chat
-- 3. Trigger pg_net → relay push otomatis setiap INSERT notifications
-- Idempotent — aman dijalankan berulang.

-- ============================================================
-- 1. PUSH SUBSCRIPTIONS
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Hanya owner yang boleh baca/hapus subs-nya (insert via API route dengan cookie)
drop policy if exists "own subs select" on public.push_subscriptions;
create policy "own subs select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
drop policy if exists "own subs insert" on public.push_subscriptions;
create policy "own subs insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
drop policy if exists "own subs delete" on public.push_subscriptions;
create policy "own subs delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 2. CHAT UNREAD BADGE RPC
-- ============================================================
create or replace function public.get_chat_unread_total(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from chat_messages m
  join chat_channel_members cm on cm.channel_id = m.channel_id and cm.user_id = p_user_id
  left join chat_read_receipts rr on rr.channel_id = m.channel_id and rr.user_id = p_user_id
  where m.user_id <> p_user_id
    and m.deleted_at is null
    and (rr.last_read_at is null or m.created_at > rr.last_read_at);
$$;

-- ============================================================
-- 3. PUSH RELAY TRIGGER (pg_net)
--    Setiap INSERT ke notifications → POST ke relay endpoint Vercel
--    Relay mengirim web-push (+ email instan utk task_assigned).
--    URL & secret di-inject oleh run-migration-v103.mjs (placeholder).
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'pg_net not available: % — jalankan manual di Dashboard > Database > Extensions', sqlerrm;
end $$;

create or replace function public.notify_push_relay()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := '__RELAY_URL__',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Relay-Secret', '__RELAY_SECRET__'
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
end $$;

drop trigger if exists trg_notifications_push_relay on public.notifications;
create trigger trg_notifications_push_relay
  after insert on public.notifications
  for each row execute function public.notify_push_relay();
-- ============================================================
-- 4. NOTIF PESAN CHAT UTK SEMUA MEMBER CHANNEL
--    INSERT chat_messages → notification utk semua member
--    (kecuali pengirim). Trigger push relay di atas otomatis
--    terpanggil karena INSERT ke notifications.
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
  if new.message_type is not null and new.message_type not in ('text') then
    return new; -- hanya pesan teks yang generate notif
  end if;

  select coalesce(full_name, email) into sender_name from profiles where id = new.user_id;
  select name into channel_name from chat_channels where id = new.channel_id;

  insert into notifications (user_id, type, title, message, link, read, created_at)
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
    and cm.user_id <> new.user_id
    and cm.user_id is not null;

  return new;
end;
$$;

drop trigger if exists trg_notify_chat_members on public.chat_messages;
create trigger trg_notify_chat_members
  after insert on public.chat_messages
  for each row execute function public.notify_chat_members();
