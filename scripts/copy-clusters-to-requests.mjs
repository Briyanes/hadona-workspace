/**
 * Copy data dari ads_content_clusters (MASTER publish sheet) → ads_creative_requests
 * Supaya tab "Creative Request" (default Content Studio) berisi data master.
 * Dedup: marker "[MASTER]" di notes + key (client_id, hook).
 * Idempotent: jalankan berkali-kali tidak menduplikat.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MARKER = '[MASTER]';

function mapStatus(progress) {
  if (progress === 'Active') return 'published';
  if (progress === 'Inactive') return 'done';
  return 'pending';
}

function normDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${from}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!res.ok) throw new Error(`${table} fetch ${res.status}: ${await res.text()}`);
    const data = await res.json();
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function insertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ads_creative_requests`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log('📥 Fetch clusters (master) & existing requests...');
  const clusters = await fetchAll(
    'ads_content_clusters',
    'id,client_id,theme,pillar,details,caption,content_copy,result_link,format_type,entry_date,progress,client_hint,referensi'
  );
  const existing = await fetchAll('ads_creative_requests', 'id,client_id,hook,notes');

  // Key dedup: marker di notes ATAU (client_id + hook) sama
  const existingKeys = new Set(
    existing.map((r) => `${r.client_id || ''}|${r.hook || ''}`)
  );
  const alreadyMaster = existing.filter((r) => r.notes?.startsWith(MARKER)).length;

  const toInsert = [];
  let skipped = 0;
  for (const c of clusters) {
    if (!c.client_id) {
      skipped++;
      continue;
    }
    const key = `${c.client_id}|${c.theme || ''}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);

    // Gabung caption + content_copy kalau dua-duanya ada
    let caption = null;
    if (c.caption && c.content_copy) caption = `${c.caption}\n\n---\n\n${c.content_copy}`;
    else caption = c.caption || c.content_copy || null;

    const notesParts = [MARKER];
    if (c.details) notesParts.push(c.details);
    if (c.client_hint) notesParts.push(`Client hint: ${c.client_hint}`);
    if (c.referensi) notesParts.push(`Referensi: ${c.referensi}`);

    toInsert.push({
      client_id: c.client_id,
      hook: c.theme || null,
      angle: c.pillar || null,
      caption,
      notes: notesParts.join('\n'),
      content_link: c.result_link || null,
      format_type: c.format_type || null,
      request_date: normDate(c.entry_date),
      status: mapStatus(c.progress),
      funnel: null,
      objective: null,
      cta: null,
      prefilled_message: null,
    });
  }

  console.log(`   Clusters: ${clusters.length}, existing requests: ${existing.length} (${alreadyMaster} sudah master)`);
  console.log(`   Akan insert: ${toInsert.length}, skip: ${skipped}`);

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    await insertBatch(batch);
    inserted += batch.length;
    console.log(`   ✅ Inserted ${inserted}/${toInsert.length}`);
  }

  console.log(`\n📊 Selesai: ${inserted} inserted, ${skipped} skipped (duplikat/tanpa client)`);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});