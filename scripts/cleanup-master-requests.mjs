/**
 * Cleanup: hapus baris [MASTER] dari ads_creative_requests.
 * Tab "Creative Request" kembali ke fungsi aslinya (form request internal, kosong).
 * Tab "Ads Creative" (ads_content_clusters) TIDAK disentuh.
 *
 * Langkah:
 * 1. Backup seluruh ads_creative_requests ke scripts/backup-requests-full-<timestamp>.json
 * 2. DELETE per batch pakai id=in.(...) (filter eq. berulang di PostgREST di-AND-kan
 *    sehingga cocok 0 baris — bug pada versi awal script ini)
 * 3. Verifikasi count akhir semua tabel content studio
 *
 * Safety: --dry-run untuk lihat apa yang akan dihapus tanpa menghapus.
 */
import { config } from 'dotenv';
import { writeFileSync } from 'fs';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MARKER = '[MASTER]';
const DRY_RUN = process.argv.includes('--dry-run');

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=id&limit=1000&offset=${from}`,
      { headers: H }
    );
    if (!res.ok) throw new Error(`${table} fetch ${res.status}: ${await res.text()}`);
    const data = await res.json();
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function main() {
  console.log('📥 Fetch semua ads_creative_requests...');
  const all = await fetchAll('ads_creative_requests', '*');
  const masterRows = all.filter((r) => r.notes?.startsWith(MARKER));
  const manualRows = all.filter((r) => !r.notes?.startsWith(MARKER));

  console.log(`   Total: ${all.length} | [MASTER] (akan dihapus): ${masterRows.length} | manual (dipertahankan): ${manualRows.length}`);

  // 1. Backup semua (full snapshot)
  const ts = new Date().toISOString();
  const backupFile = `scripts/backup-requests-full-${ts}.json`;
  writeFileSync(backupFile, JSON.stringify({ exportedAt: ts, total: all.length, rows: all }, null, 2));
  console.log(`💾 Backup full → ${backupFile}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN: tidak ada yang dihapus. Baris [MASTER] yang akan dihapus:');
    for (const r of masterRows.slice(0, 5)) {
      console.log(`   #${r.id} client=${r.client_id || '-'} hook="${(r.hook || '').slice(0, 50)}"`);
    }
    if (masterRows.length > 5) console.log(`   ... dan ${masterRows.length - 5} lainnya`);
    return;
  }

  // 2. Delete [MASTER] rows secara batch pakai id=in.(...)
  let deleted = 0;
  for (let i = 0; i < masterRows.length; i += 50) {
    const batch = masterRows.slice(i, i + 50);
    const idList = batch.map((r) => `"${r.id}"`).join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ads_creative_requests?id=in.(${idList})`,
      {
        method: 'DELETE',
        headers: { ...H, Prefer: 'return=representation' },
      }
    );
    if (!res.ok) throw new Error(`delete ${res.status}: ${await res.text()}`);
    const gone = await res.json();
    deleted += gone.length;
    console.log(`   🗑️  Deleted ${deleted}/${masterRows.length} (batch matched ${gone.length})`);
  }
  if (deleted !== masterRows.length) {
    console.warn(`⚠️  Total deleted (${deleted}) != target (${masterRows.length}). Cek ulang!`);
  }

  // 3. Verifikasi
  const [req, cap, clu] = await Promise.all([
    fetchAll('ads_creative_requests', 'id'),
    fetchAll('ads_captions', 'id'),
    fetchAll('ads_content_clusters', 'id'),
  ]);
  console.log('\n📊 Verifikasi akhir:');
  console.log(`   ads_creative_requests : ${req.length} (harusnya = ${manualRows.length}, request manual)`);
  console.log(`   ads_captions          : ${cap.length} (Banking Caption, diisi manual)`);
  console.log(`   ads_content_clusters  : ${clu.length} (Ads Creative = data spreadsheet, TIDAK disentuh) ✅`);
  console.log(`\n✅ Selesai: ${deleted} baris [MASTER] dihapus. Restore bisa dari ${backupFile}`);
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});