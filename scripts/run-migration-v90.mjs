/**
 * Run migration-v90 via PostgREST (exec_sql RPC not available on this project).
 * Konsolidasi divisi: "Content Production" → "Editor" (tasks + profiles)
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function migrateTasks() {
  // 1) Count tasks with old division
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tasks?division=eq.Content%20Production&select=id`,
    { headers: HEADERS }
  );
  const rows = await countRes.json();
  console.log(`📦 Tasks dengan division "Content Production": ${Array.isArray(rows) ? rows.length : JSON.stringify(rows)}`);

  // 2) PATCH all of them to 'Editor'
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tasks?division=eq.Content%20Production`,
    {
      method: 'PATCH',
      headers: { ...HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ division: 'Editor' }),
    }
  );
  if (!patchRes.ok) {
    const t = await patchRes.text();
    throw new Error(`PATCH tasks gagal: ${t}`);
  }
  console.log('✅ tasks.division: "Content Production" → "Editor"');

  // 3) Verify
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tasks?division=eq.Content%20Production&select=id`,
    { headers: HEADERS }
  );
  const remaining = await verifyRes.json();
  console.log(`🔍 Verifikasi — sisa "Content Production" di tasks: ${Array.isArray(remaining) ? remaining.length : '?'}`);
}

async function migrateProfiles() {
  // 1) Fetch profiles whose division array contains 'Content Production'
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,division&division=cs.{"Content Production"}`,
    { headers: HEADERS }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET profiles gagal: ${t}`);
  }
  const profiles = await res.json();
  console.log(`\n📦 Profiles dengan division mengandung "Content Production": ${profiles.length}`);

  let ok = 0;
  for (const p of profiles) {
    const current = Array.isArray(p.division) ? p.division : [];
    // Remove old value, add 'Editor' if not present (preserve order)
    const next = current.filter((d) => d !== 'Content Production');
    if (!next.includes('Editor')) next.push('Editor');

    const patch = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { ...HEADERS, Prefer: 'return=minimal' },
      body: JSON.stringify({ division: next }),
    });
    if (!patch.ok) {
      const t = await patch.text();
      console.log(`  ❌ profile ${p.id}: ${t.substring(0, 120)}`);
    } else {
      console.log(`  ✅ profile ${p.id}: [${current.join(', ')}] → [${next.join(', ')}]`);
      ok++;
    }
  }
  console.log(`📊 Profiles updated: ${ok}/${profiles.length}`);
}

async function main() {
  console.log(`🚀 Migration v90 → ${SUPABASE_URL}\n`);
  await migrateTasks();
  await migrateProfiles();
  console.log('\n🎉 Migration v90 selesai');
}

main().catch((e) => {
  console.error('❌ FATAL:', e.message);
  process.exit(1);
});