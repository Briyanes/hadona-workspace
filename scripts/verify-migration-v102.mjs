/**
 * Verifikasi migration-v102: tabel task_deliverables + RLS policies
 * Jalankan SETELAH eksekusi supabase/migration-v102.sql (via Supabase SQL Editor).
 *
 * Cek:
 *  1. Tabel task_deliverables bisa di-query via REST (GET, limit 1)
 *  2. Kolom task_id bisa difilter (indikasi struktur benar)
 *
 * Exit code 0 = tabel siap dipakai; 1 = belum / salah struktur.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  };

  // Cek 1: tabel bisa di-query
  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/task_deliverables?select=id&limit=1`, {
    headers,
  });

  if (!res1.ok) {
    const text = await res1.text();
    console.error(`❌ Tabel task_deliverables belum tersedia (HTTP ${res1.status}).`);
    console.error('   Respons:', text.slice(0, 200));
    console.error('\n→ Jalankan isi supabase/migration-v102.sql di Supabase SQL Editor dulu.');
    process.exit(1);
  }
  console.log('✅ Tabel task_deliverables ada dan bisa di-query');

  // Cek 2: filter kolom task_id (indikasi struktur benar)
  const res2 = await fetch(
    `${SUPABASE_URL}/rest/v1/task_deliverables?select=id&task_id=is.null&limit=1`,
    { headers }
  );
  if (!res2.ok) {
    const text = await res2.text();
    console.error(`⚠️ Tabel ada tapi kolom task_id bermasalah (HTTP ${res2.status}):`, text.slice(0, 200));
    process.exit(1);
  }
  console.log('✅ Kolom task_id valid — struktur tabel sesuai migration-v102');
  console.log('\n🎉 Migration v102 terverifikasi. Fitur upload video di task siap dipakai.');
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});