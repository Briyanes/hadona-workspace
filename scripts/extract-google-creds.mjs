#!/usr/bin/env node
/**
 * extract-google-creds.mjs
 *
 * Membaca 2 file client_secret_*.json di private-archive/ dan menghasilkan:
 *   1. Nilai GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI siap-copy ke Vercel
 *   2. Validasi otomatis:
 *      - Redirect URI harus https:// (bukan http://)
 *      - Client "integrasi" harus punya redirect ke /api/google/callback
 *      - Client "login" harus punya redirect ke supabase.co/auth/v1/callback
 *
 * Pemakaian:
 *   node scripts/extract-google-creds.mjs
 *   node scripts/extract-google-creds.mjs --mask   (sembunyikan secret, untuk screenshot)
 *
 * File credential tidak pernah keluar dari mesin ini — script hanya print ke terminal.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_DIR = join(__dirname, "..", "private-archive");

const mask = process.argv.includes("--mask");
const issues = [];
const results = [];

// ---------- util ----------
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function maskSecret(s) {
  if (!mask || !s) return s;
  return s.slice(0, 8) + "..." + s.slice(-4);
}

// ---------- load ----------
let files;
try {
  files = readdirSync(ARCHIVE_DIR)
    .filter((f) => /^client_secret_.*\.json$/.test(f))
    .sort();
} catch {
  console.error(red(`✗ Folder ${ARCHIVE_DIR} tidak ditemukan.`));
  process.exit(1);
}

if (files.length === 0) {
  console.error(red(`✗ Tidak ada file client_secret_*.json di private-archive/.`));
  process.exit(1);
}

console.log(bold(`\n=== Google OAuth Credentials — private-archive (${files.length} file) ===\n`));

for (const file of files) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(ARCHIVE_DIR, file), "utf8"));
  } catch (e) {
    issues.push(`${file}: JSON tidak valid — ${e.message}`);
    continue;
  }

  const web = raw.web;
  if (!web?.client_id) {
    issues.push(`${file}: bukan credential tipe "web" atau client_id kosong`);
    continue;
  }

  const redirectUris = web.redirect_uris ?? [];
  const isIntegration = redirectUris.some((u) => u.includes("/api/google/callback"));

  results.push({
    file,
    role: isIntegration ? "integrasi (Meet/Drive)" : "login (Supabase)",
    clientId: web.client_id,
    clientSecret: web.client_secret,
    projectId: web.project_id ?? "(tidak ada)",
    redirectUris,
  });
}

// ---------- per-file report ----------
for (const r of results) {
  console.log(bold(`📄 ${r.file}`));
  console.log(`   Peran      : ${r.role}`);
  console.log(`   Project    : ${r.projectId}`);
  console.log(`   Client ID  : ${maskSecret(r.clientId)}`);
  console.log(`   Secret     : ${maskSecret(r.clientSecret)}`);
  console.log(`   Redirects  :`);
  r.redirectUris.forEach((u) => {
    const isHttp = u.startsWith("http://");
    const mark = isHttp ? red("✗ http://") : green("✓ https://");
    console.log(`     ${mark} ${u}`);
    if (isHttp) issues.push(`${r.file}: redirect "${u}" masih http:// — ubah ke https:// di GCP Console`);
  });

  // validasi peran
  if (r.role.startsWith("integrasi")) {
    const hasApiCb = r.redirectUris.some((u) => u.includes("/api/google/callback"));
    if (!hasApiCb) issues.push(`${r.file}: client integrasi tanpa /api/google/callback`);
  } else {
    const hasSupabaseCb = r.redirectUris.some((u) => u.includes("supabase.co/auth/v1/callback"));
    if (!hasSupabaseCb) {
      issues.push(
        `${r.file}: client LOGIN belum punya redirect "https://<ref>.supabase.co/auth/v1/callback" — WAJIB ditambahkan di GCP Console, kalau tidak login Google akan gagal`
      );
    }
  }
  console.log("");
}

// ---------- env-ready output (client integrasi) ----------
const integration = results.find((r) => r.role.startsWith("integrasi"));
if (integration) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id";
  console.log(bold("--- Salin ke Vercel → Settings → Environment Variables ---\n"));
  console.log(`GOOGLE_CLIENT_ID=${integration.clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${mask ? "GOLONGKAN-DENGAN-NILAI-ASLI" : integration.clientSecret}`);
  console.log(`GOOGLE_REDIRECT_URI=${appUrl}/api/google/callback`);
  console.log("");
  console.log(bold("--- Salin ke Supabase → Auth → Providers → Google (client LOGIN) ---\n"));
  const login = results.find((r) => r.role.startsWith("login"));
  if (login) {
    console.log(`Client ID  : ${login.clientId}`);
    console.log(`Secret     : ${mask ? "GOLONGKAN-DENGAN-NILAI-ASLI" : login.clientSecret}`);
    console.log(`(Daftarkan juga "Callback URL (for OAuth)" = https://<ref>.supabase.co/auth/v1/callback di GCP Console)`);
  }
  console.log("");
}

// ---------- summary ----------
console.log(bold("=== Ringkasan Validasi ==="));
if (issues.length === 0) {
  console.log(green("✓ Semua redirect URI valid (https) dan peran client sesuai."));
} else {
  issues.forEach((i) => console.log(yellow(`! ${i}`)));
  console.log("");
  console.log(`Perbaiki dulu di GCP Console → APIs & Services → Credentials, lalu re-download JSON-nya.`);
}

console.log(`\nHash file (verifikasi identitas antar-mesin):`);
for (const r of results) {
  const buf = readFileSync(join(ARCHIVE_DIR, r.file));
  const h = createHash("sha256").update(buf).digest("hex").slice(0, 16);
  console.log(`  ${r.file}: ${h}`);
}

process.exit(issues.length ? 2 : 0);