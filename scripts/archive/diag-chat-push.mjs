/**
 * Diagnose chat mention push pipeline (read-only).
 * Checks:
 *  1. notifications table columns (body vs message mismatch)
 *  2. triggers on notifications + chat_messages
 *  3. notify_push_relay function definition (URL injected or placeholder?)
 *  4. pg_net extension
 *  5. push_subscriptions ↔ profiles mapping
 *  6. recent chat_message/chat_mention notifications
 *  7. recent chat_messages with mentions
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function query(label, sql) {
  // Path 1: /pg/query (returns rows)
  try {
    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`\n=== ${label} ===`);
      console.log(JSON.stringify(data, null, 2).slice(0, 3000));
      return data;
    }
    const t = await res.text();
    console.log(`\n=== ${label} === /pg/query failed: ${res.status} ${t.slice(0, 200)}`);
  } catch (e) {
    console.log(`\n=== ${label} === /pg/query error: ${e.message}`);
  }
  // Path 2: rpc exec_sql
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ sql_text: `select json_agg(t) as rows from (${sql}) t` }),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`\n=== ${label} ===`);
      console.log(JSON.stringify(data, null, 2).slice(0, 3000));
      return data;
    }
    const t = await res.text();
    console.log(`\n=== ${label} === exec_sql failed: ${res.status} ${t.slice(0, 200)}`);
  } catch (e) {
    console.log(`\n=== ${label} === exec_sql error: ${e.message}`);
  }
  return null;
}

// 1. notifications columns
await query('1. notifications columns', `
  select column_name, data_type
  from information_schema.columns
  where table_schema='public' and table_name='notifications'
  order by ordinal_position
`);

// 2. triggers
await query('2. triggers (notifications & chat_messages)', `
  select event_object_table as tbl, trigger_name, action_timing, event_manipulation
  from information_schema.triggers
  where trigger_schema='public'
    and event_object_table in ('notifications','chat_messages')
  order by event_object_table, trigger_name
`);

// 3. relay function def
await query('3. notify_push_relay function (URL check)', `
  select prosrc from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and proname='notify_push_relay'
`);

// 4. pg_net
await query('4. pg_net extension', `
  select extname, extversion from pg_extension where extname='pg_net'
`);

// 4b. recent pg_net http requests (last 10)
await query('4b. net._http_response recent (relay called?)', `
  select id, status_code, error_msg, created
  from net._http_response
  order by created desc
  limit 10
`);

// 5. push subs + user mapping
await query('5. push_subscriptions + profile', `
  select ps.endpoint_host, ps.user_agent, ps.created_at, ps.last_seen_at,
         u.email, u.full_name
  from (
    select split_part(endpoint, '/', 3) as endpoint_host, user_agent, created_at, last_seen_at, user_id
    from public.push_subscriptions
    order by created_at desc
    limit 20
  ) ps
  join public.profiles u on u.id = ps.user_id
`);

// 6. recent chat notifications (last 24h)
await query('6. recent chat notifications (24h)', `
  select n.user_id, p.full_name, n.type, n.title, left(coalesce(n.body, n.message), 60) as preview, n.created_at, n.read
  from public.notifications n
  left join public.profiles p on p.id = n.user_id
  where n.type in ('chat_message','chat_mention')
    and n.created_at > now() - interval '24 hours'
  order by n.created_at desc
  limit 20
`);

// 7. recent chat messages with mentions
await query('7. recent chat messages w/ mentions (24h)', `
  select m.created_at, p.full_name as sender, m.mentions, left(m.content, 80) as content_preview
  from public.chat_messages m
  left join public.profiles p on p.id = m.user_id
  where m.mentions is not null
    and m.created_at > now() - interval '24 hours'
  order by m.created_at desc
  limit 10
`);

// 8. team channel members sanity
await query('8. team channel + members', `
  select c.id, c.name, count(cm.user_id) as member_count
  from public.chat_channels c
  left join public.chat_channel_members cm on cm.channel_id = c.id
  group by c.id, c.name
  order by member_count desc
  limit 5
`);

console.log('\nDone.');
