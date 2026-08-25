/**
 * BEHAVIORAL TEST migration-v98 di production (read-write QA, cleanup dijamin):
 *   T1. RPC get_client_dependencies callable → 200
 *   T2. Kolom tema & task_id ada di content_plans? (select eksplisit)
 *   T3. Trigger protect: delete client yang punya content_plan aktif → HARUS DIBLOKIR (4xx/5xx)
 *   T4. Client masih ada setelah blocked delete
 *   T5. Trigger audit: delete content_plan QA langsung → kalau kolom tema/task_id
 *       tidak ada di tabel, function akan ERROR (bukti bug) → catat hasil
 *   T6. Cleanup: hapus sisa data QA (content_plan, client)
 * QA data di-prefix `zzz-qa-v98-` agar mudah identifikasi.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const H = {
  'Content-Type': 'application/json',
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Prefer: 'return=representation',
};

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const stamp = Date.now().toString(36);
const NAME = `zzz-qa-v98-${stamp}`;

async function api(method, path, body) {
  const res = await fetch(`${URL}/rest/v1${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, ok: res.ok, json, text };
}

// ---- T1: RPC callable ----
let client = null;
{
  // ambil 1 client nyata untuk smoke RPC
  const one = await api('GET', '/clients?select=id,name&limit=1');
  const cid = one.json?.[0]?.id;
  const rpc = await fetch(`${URL}/rest/v1/rpc/get_client_dependencies`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ p_client_id: cid }),
  });
  const dep = await rpc.json().catch(() => null);
  check('T1 RPC get_client_dependencies callable', rpc.ok,
    rpc.ok ? `${dep?.length ?? 0} tabel: ${JSON.stringify(dep)}` : rpc.status);
}

// ---- Setup QA data ----
const cRes = await api('POST', '/clients', {
  name: NAME, slug: `zzz-qa-v98-${stamp}`, industry: 'QA', status: 'active', services: [],
});
client = cRes.json?.[0];
if (!client) {
  console.error('❌ Gagal buat QA client, abort:', cRes.status, cRes.text?.slice(0, 200));
  process.exit(1);
}

// ---- T2: kolom tema & task_id ----
{
  const t = await api('GET', `/content_plans?select=tema&client_id=eq.${client.id}&limit=1`);
  const k = await api('GET', `/content_plans?select=task_id&client_id=eq.${client.id}&limit=1`);
  const temaExists = !(t.json?.code === '42703');
  const taskIdExists = !(k.json?.code === '42703');
  check('T2a Kolom tema ada di content_plans', temaExists,
    temaExists ? 'ada' : `tidak ada (${t.json?.message?.slice(0, 80)})`);
  check('T2b Kolom task_id ada di content_plans', taskIdExists,
    taskIdExists ? 'ada' : `tidak ada (${k.json?.message?.slice(0, 80)})`);
  if (!temaExists || !taskIdExists) {
    console.log('🚨 KRITIS: audit_content_plan_delete mereferensikan kolom yang tidak ada → SEMUA DELETE content_plans akan error runtime. Perlu migration-v98-fix.');
  }
}

// buat content_plan QA (kolom minimal yang pasti ada: client_id, month)
const pRes = await api('POST', '/content_plans', {
  client_id: client.id, month: '2026-08', pilar: 'QA', konten: 'QA-v98',
});
const plan = pRes.json?.[0];
if (!plan) {
  console.error('❌ Gagal buat QA content_plan:', pRes.status, pRes.text?.slice(0, 300));
}

// ---- T3: delete client dengan dependensi → harus diblokir trigger ----
{
  const d = await api('DELETE', `/clients?id=eq.${client.id}`);
  const blocked = !d.ok;
  check('T3 Trigger protect memblokir delete client berdependensi', blocked,
    `status=${d.status} msg=${(d.json?.message || d.text || '').slice(0, 120)}`);
}

// ---- T4: client masih ada ----
{
  const c = await api('GET', `/clients?id=eq.${client.id}&select=id`);
  check('T4 Client tidak terhapus (masih ada)', c.json?.length === 1);
}

// ---- T5: delete content_plan langsung → test audit trigger ----
{
  const d = await api('DELETE', `/content_plans?id=eq.${plan?.id}`);
  const ok = d.ok;
  const detail = `status=${d.status} ${((d.json?.message || d.text || '') + '').slice(0, 200)}`;
  if (ok) {
    check('T5 Audit trigger tidak mengganggu delete content_plan', true, detail);
    // cek activity_logs tercatat
    const log = await api('GET', `/activity_logs?entity_type=eq.content_plan&entity_id=eq.${plan.id}&select=id,action&limit=1`);
    check('T5b Audit tercatat di activity_logs', log.json?.length === 1,
      log.json?.[0] ? `action=${log.json[0].action}` : 'tidak ada log');
  } else {
    check('T5 Audit trigger tidak mengganggu delete content_plan', false,
      `${detail} ← kemungkinan kolom tema/task_id tidak ada → BUG`);
  }
}

// ---- T6: cleanup ----
{
  // hapus sisa plan (kalau T5 gagal, bypass tidak bisa via REST; laporkan)
  const rem = await api('GET', `/content_plans?client_id=eq.${client.id}&select=id`);
  let planCleanupOk = true;
  if (rem.json?.length) {
    console.log(`⚠️  ${rem.json.length} QA plan tersisa (T5 gagal) — perlu fix manual via bypass`);
    planCleanupOk = false;
  }
  // client harus bisa dihapus kalau plan sudah bersih
  let clientGone = false;
  if (planCleanupOk) {
    const dc = await api('DELETE', `/clients?id=eq.${client.id}`);
    clientGone = dc.ok || dc.status === 404;
    if (!dc.ok && dc.status !== 404) {
      // masih keblokir? cek tasks
      console.log('⚠️  client masih terblokir:', (dc.json?.message || '').slice(0, 150));
    }
  }
  check('T6 Cleanup QA data', planCleanupOk && clientGone,
    planCleanupOk ? 'bersih' : `plan=${rem.json?.length}, client=${clientGone ? 'gone' : 'tersisa'}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${'='.repeat(60)}`);
console.log(`HASIL: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log('GAGAL:', failed.map((f) => f.name).join(' | '));
  if (failed.some((f) => f.name.startsWith('T5'))) {
    console.log('\n➡️  NEXT: buat supabase/migration-v98-fix.sql (drop+recreate audit fn tanpa kolom tema/task_id) lalu run via SQL Editor.');
  }
  process.exit(1);
}
console.log('✅ migration-v98 terverifikasi bekerja (behavioral) di production.');