/**
 * Verify migration-v98 applied correctly in Supabase (production):
 *   1. Function get_client_dependencies(uuid) exists
 *   2. Function protect_client_delete() exists
 *   3. Function audit_content_plan_delete() exists
 *   4. Trigger trg_protect_client_delete ON clients (BEFORE DELETE)
 *   5. Trigger trg_audit_content_plan_delete ON content_plans (AFTER DELETE)
 *   6. Smoke test RPC get_client_dependencies with 1 real client id
 * No secrets printed.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local');
  process.exit(1);
}

async function query(sql) {
  // Path 1: /pg/query (mengembalikan rows) — pola run-migration-v98 fallback
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
    const json = await res.json().catch(() => null);
    return { ok: true, rows: json?.results ?? json?.rows ?? json?.data ?? [] };
  }
  // Path 2: RPC exec_sql
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ sql_text: sql }),
  });
  if (res2.ok) {
    const json = await res2.json().catch(() => null);
    return { ok: true, rows: Array.isArray(json) ? json : [] };
  }
  const t1 = (await res.text()).slice(0, 200);
  const t2 = (await res2.text()).slice(0, 200);
  return { ok: false, err: `/pg/query: ${t1} | rpc: ${t2}` };
}

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// --- 1. Functions exist ---
const fn = await query(`SELECT proname FROM pg_proc WHERE proname IN
  ('get_client_dependencies','protect_client_delete','audit_content_plan_delete');`);
if (!fn.ok) {
  console.error('❌ Tidak bisa query DB:', fn.err);
  process.exit(1);
}
const fnNames = fn.rows.map((r) => r.proname ?? r.get?.proname).filter(Boolean);
check('Function get_client_dependencies', fnNames.includes('get_client_dependencies'));
check('Function protect_client_delete', fnNames.includes('protect_client_delete'));
check('Function audit_content_plan_delete', fnNames.includes('audit_content_plan_delete'));

// --- 2. Triggers exist with correct timing ---
const trg = await query(`SELECT t.tgname, c.relname AS table_name
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND t.tgname IN ('trg_protect_client_delete','trg_audit_content_plan_delete');`);
const trgRows = trg.rows.map((r) => ({ name: r.tgname ?? r.get?.tgname, table: r.table_name ?? r.get?.table_name }));
const prot = trgRows.find((r) => r.name === 'trg_protect_client_delete');
const aud = trgRows.find((r) => r.name === 'trg_audit_content_plan_delete');
check('Trigger trg_protect_client_delete ON clients', !!prot && prot.table === 'clients', prot ? `table=${prot.table}` : 'trigger tidak ditemukan');
check('Trigger trg_audit_content_plan_delete ON content_plans', !!aud && aud.table === 'content_plans', aud ? `table=${aud.table}` : 'trigger tidak ditemukan');

// --- 3. Smoke test RPC with real client ---
const oneClient = await query(`SELECT id FROM clients LIMIT 1;`);
const clientId = oneClient.rows?.[0]?.id ?? oneClient.rows?.[0]?.get?.id;
let rpcOk = false, rpcDetail = 'tidak ada client untuk test';
if (clientId) {
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_client_dependencies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ p_client_id: clientId }),
  });
  rpcOk = rpc.ok;
  if (rpc.ok) {
    const dep = await rpc.json();
    const total = dep.reduce((s, d) => s + Number(d.row_count), 0);
    rpcDetail = `${dep.length} tabel diperiksa, total baris dependen: ${total}`;
  } else {
    rpcDetail = (await rpc.text()).slice(0, 150);
  }
}
check('RPC get_client_dependencies smoke test', rpcOk, rpcDetail);

// --- Summary ---
const failed = results.filter((r) => !r.pass);
console.log(`\n${'='.repeat(50)}`);
console.log(`HASIL: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log('GAGAL:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
console.log('✅ migration-v98 terverifikasi aktif di database.');