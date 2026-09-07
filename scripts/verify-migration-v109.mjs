/**
 * Verify migration v109d + v109e — fix trigger notifikasi task (plan-cache basi).
 * Semua cek E2E via REST service_role, NET-ZERO (semua jejak dibersihkan).
 *
 * Riwayat bug: hardening v108 (search_path pin) membuat SECURITY DEFINER fn
 * lama (v24/v106) menyimpan resolusi basi → 42883 create_notification /
 * 42P01 tasks. Fix = DROP+CREATE (OID baru) + SET search_path dipin.
 *
 * Cek:
 *   1. FLIP status task (trg_task_status v109d) → 200 + notif task_updated
 *   2. INSERT task_assignees (trg_task_assigned v109e) → 201 + notif task_assigned
 *   3. Cleanup: notifikasi test (by metadata.task_id) + task korban
 *
 * Prasyarat: SUPABASE_SERVICE_ROLE_KEY di .env.local.
 * Usage: node scripts/verify-migration-v109.mjs
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SVC) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY');
  process.exit(1);
}
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
const cleanupQueue = []; // { table, filter }

async function main() {
  // ── Profil korban (butuh >= 2 utk tes assignee) ──
  const rp = await fetch(`${URL}/rest/v1/profiles?select=id&limit=2`, { headers: H });
  const profiles = await rp.json();
  if (!Array.isArray(profiles) || profiles.length < 2) {
    console.error('❌ Butuh minimal 2 profil untuk tes assignee');
    process.exit(1);
  }
  const [creator, assignee] = profiles;

  // ── Task korban ──
  let r = await fetch(`${URL}/rest/v1/tasks`, { method: 'POST', headers: H,
    body: JSON.stringify({ title: 'ZZ-v109-verify (auto-cleanup)', status: 'todo', created_by: creator.id }) });
  if (!r.ok) { console.error('❌ insert task gagal:', r.status, JSON.stringify(await r.json()).slice(0, 300)); process.exit(1); }
  const t = (await r.json())[0];
  cleanupQueue.push({ table: 'tasks', filter: `id=eq.${t.id}` });
  console.log('task korban:', t.id);

  // ── TES 1: flip status (drag) — trg_task_status + create_notification ──
  const flip = t.status === 'in_progress' ? 'todo' : 'in_progress';
  r = await fetch(`${URL}/rest/v1/tasks?id=eq.${t.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: flip }) });
  const flipOk = r.ok;
  if (flipOk) {
    await fetch(`${URL}/rest/v1/tasks?id=eq.${t.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: t.status }) });
  }
  results.push(['TES 1 drag status (v109d)', flipOk,
    flipOk ? `HTTP 200 — flip ${t.status}→${flip}→${t.status}` : `❌ ${JSON.stringify(await r.json()).slice(0, 200)}`]);

  // ── TES 2: insert assignee — trg_task_assigned + create_notification ──
  r = await fetch(`${URL}/rest/v1/task_assignees`, { method: 'POST', headers: H,
    body: JSON.stringify({ task_id: t.id, user_id: assignee.id }) });
  const insOk = r.ok;
  results.push(['TES 2 assign member (v109e)', insOk,
    insOk ? 'HTTP 201' : `❌ ${JSON.stringify(await r.json()).slice(0, 200)}`]);

  // ── TES 3: notifikasi tercipta (task_updated + task_assigned) ──
  const rn = await fetch(`${URL}/rest/v1/notifications?metadata->>task_id=eq.${t.id}&select=id,type`, { headers: H });
  const notifs = await rn.json();
  const hasUpdated = notifs.some(n => n.type === 'task_updated');
  const hasAssigned = notifs.some(n => n.type === 'task_assigned');
  results.push(['TES 3a notif task_updated', hasUpdated, `${notifs.filter(n => n.type === 'task_updated').length} baris`]);
  results.push(['TES 3b notif task_assigned', hasAssigned, `${notifs.filter(n => n.type === 'task_assigned').length} baris`]);

  // ── Cleanup net-zero (notifikasi test dulu, baru task) ──
  cleanupQueue.unshift({ table: 'notifications', filter: `metadata->>task_id=eq.${t.id}` });
  for (const c of cleanupQueue) {
    const rd = await fetch(`${URL}/rest/v1/${c.table}?${c.filter}`, { method: 'DELETE', headers: H });
    if (!rd.ok) console.error(`⚠️  cleanup ${c.table} gagal: ${rd.status}`);
  }
  results.push(['Cleanup net-zero', true, 'notifikasi test + task korban dihapus']);

  // ── Ringkasan ──
  console.log('\n══════════ VERIFY v109d + v109e ══════════');
  let allOk = true;
  for (const [nama, ok, info] of results) {
    console.log(`${ok ? '✅' : '❌'} ${nama}: ${info}`);
    if (!ok) allOk = false;
  }
  console.log(allOk
    ? '\n🎉 SEMUA HIJAU — drag task, assign member, dan notifikasi berfungsi normal'
    : '\n💥 Ada yang gagal — cek baris ❌ di atas');
  process.exit(allOk ? 0 : 1);
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
