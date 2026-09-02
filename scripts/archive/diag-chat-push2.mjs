/**
 * Diagnose chat push via PostgREST (no raw SQL needed) + relay endpoint probe.
 * Read-only.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.hadona.id').replace(/\/$/, '');

const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${KEY}`,
  apikey: KEY,
};

async function rest(label, path) {
  try {
    const res = await fetch(`${SB}/rest/v1/${path}`, { headers: H });
    const data = res.ok ? await res.json() : `HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`;
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(data, null, 2).slice(0, 2500));
    return res.ok ? data : null;
  } catch (e) {
    console.log(`\n=== ${label} === ERROR ${e.message}`);
    return null;
  }
}

// 0. Root: what tables exist in REST (sanity)
// 1. Find briyanes profile
const profiles = await rest('1. profile briyanes', 'profiles?select=id,full_name,email&full_name=ilike.*briyanes*');
const me = profiles?.[0];
console.log('\n>>> target user:', me?.id, me?.full_name, me?.email);

if (me) {
  // 2. Push subs for this user
  await rest('2. push_subscriptions (briyanes)', `push_subscriptions?select=endpoint,user_agent,created_at,last_seen_at&user_id=eq.${me.id}`);
  // 3. Recent chat notifs for this user
  await rest('3. chat notifs (briyanes, 7d)', `notifications?select=id,type,title,body,created_at,read&user_id=eq.${me.id}&type=in.(chat_message,chat_mention)&order=created_at.desc&limit=10`);
}

// 4. All push subs overview
await rest('4. all push_subscriptions', 'push_subscriptions?select=user_id,endpoint,user_agent,created_at&order=created_at.desc&limit=20');

// 5. Recent chat messages (any channel, 24h approx via order+limit)
await rest('5. recent chat_messages', 'chat_messages?select=id,channel_id,user_id,message_type,mentions,content,created_at&order=created_at.desc&limit=10');

// 6. Recent chat_message notifications ANY user — does trigger fire at all?
await rest('6. recent chat_message notifs (any user)', 'notifications?select=user_id,type,title,created_at&type=in.(chat_message,chat_mention)&order=created_at.desc&limit=10');

// 7. Probe relay endpoint (no destructive action):
//    - no secret  -> expect 403 (route exists)
//    - wrong secret -> expect 403
//    - right secret + dummy payload -> expect 400 "Invalid payload" (secret OK!)
const RELAY_SECRET = process.env.PUSH_RELAY_SECRET || process.env.CRON_SECRET || '';
console.log('\n=== 7. relay probe ===');
for (const [label, secret, body] of [
  ['no secret', null, JSON.stringify({ user_id: 'x', title: 't' })],
  ['wrong secret', 'definitely-wrong', JSON.stringify({ user_id: 'x', title: 't' })],
  ['right secret (dummy payload)', RELAY_SECRET || '(EMPTY in .env.local!)', JSON.stringify({ user_id: 'x', title: 't' })],
]) {
  try {
    const res = await fetch(`${APP_URL}/api/push/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Relay-Secret': secret } : {}) },
      body,
    });
    console.log(`${label}: HTTP ${res.status}`, (res.status >= 400 ? (await res.text()).slice(0, 100) : ''));
  } catch (e) {
    console.log(`${label}: ERROR ${e.message}`);
  }
}
console.log('\nDone.');
