/**
 * verify-migration-v106.mjs — Verifikasi migration v106 sudah diterapkan.
 *
 * exec_sql & /pg/query tidak tersedia (ditutup sejak v99) — jadi verifikasi
 * dilakukan via REST PostgREST:
 *   1. Koneksi DB hidup (RPC show_limit)
 *   2. push_config + relay_secret terpasang (prasyarat relay v104)
 *   3. Bukti behavior: notif task_review/task_blocked muncul setelah
 *      task dipindah ke kolom Review/Blocked
 *
 * Jalankan SETELAH isi supabase/migration-v106.sql dijalankan manual
 * di Supabase SQL Editor.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function main() {
  console.log('Verifikasi migration v106...');

  // 1. Koneksi DB hidup
  const alive = await fetch(`${SUPABASE_URL}/rest/v1/rpc/show_limit`, {
    method: 'POST',
    headers: HEADERS,
    body: '{}',
  });
  if (!alive.ok) {
    console.error('❌ Tidak bisa konek ke database (RPC show_limit gagal).');
    process.exit(1);
  }
  console.log('✅ Koneksi DB OK');

  // 2. push_config row id=true harus ada agar relay v104 aktif
  const cfg = await fetch(
    `${SUPABASE_URL}/rest/v1/push_config?id=eq.true&select=id,relay_secret`,
    { headers: HEADERS }
  ).then((r) => r.json()).catch(() => null);

  if (Array.isArray(cfg) && cfg.length > 0 && cfg[0].relay_secret) {
    console.log('✅ push_config + relay_secret terpasang (relay v104 aktif)');
  } else {
    console.log('⚠️  push_config/relay_secret belum ada — web push relay tidak aktif (v104 belum dijalankan?).');
  }

  // 3. Bukti behavior trigger
  const notifs = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?type=in.(task_review,task_blocked)&select=id,type,title,created_at&order=created_at.desc&limit=5`,
    { headers: HEADERS }
  ).then((r) => r.json()).catch(() => null);

  if (Array.isArray(notifs) && notifs.length > 0) {
    console.log(`✅ Trigger HIDUP — ${notifs.length} notif task_review/task_blocked terbaru:`);
    for (const n of notifs) {
      console.log(`   [${n.created_at}] ${n.type}: ${n.title}`);
    }
    console.log('\n✅ MIGRATION v106 DEPLOYED & BERFUNGSI');
  } else {
    console.log('ℹ️  Belum ada notif task_review/task_blocked.');
    console.log('   Normal jika belum ada task yang dipindah ke review/blocked');
    console.log('   SETELAH migration dijalankan.');
    console.log('');
    console.log('=== UJI MANUAL (2 menit) ===');
    console.log('1. Login user A, buka /tasks');
    console.log('2. Pilih task dengan assignee user B (bukan A)');
    console.log('3. Drag task ke kolom Review');
    console.log('4. Cek notifikasi user B (bell icon) atau tabel notifications:');
    console.log("   select type, title, body, created_at from notifications where type in ('task_review','task_blocked') order by created_at desc limit 5;");
    console.log('5. Muncul baris task_review → v106 BERFUNGSI, jalankan ulang script ini.');
  }
}

await main();
