#!/usr/bin/env node
/**
 * Verify content_plans urutan baris sesuai sheet (created_at DESC = urutan sheet).
 * Cek: timestamp sekuensial menurun + total baris per client/bulan.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const REST = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const clients = await (await fetch(`${REST}/clients?select=id,name&limit=500`, { headers: H })).json();
const rows = await (
  await fetch(`${REST}/content_plans?select=id,client_id,month,pilar,tema,created_at&order=created_at.desc&limit=500`, { headers: H })
).json();

const byName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
let ok = true;
const groups = {};
for (const r of rows) {
  const k = `${byName[r.client_id]} | ${r.month}`;
  (groups[k] ||= []).push(r);
}
console.log("Client | Bulan | Baris | created_at (DESC, 3 pertama → 3 terakhir)");
for (const [k, g] of Object.entries(groups).sort()) {
  const first3 = g.slice(0, 3).map((r) => r.created_at.slice(11, 16)).join(", ");
  const last3 = g.slice(-3).map((r) => r.created_at.slice(11, 16)).join(", ");
  // timestamps harus menurun ketat (baris atas sheet = paling baru)
  const mono = g.every((r, i) => i === 0 || new Date(g[i - 1].created_at) > new Date(r.created_at));
  if (!mono) ok = false;
  console.log(`${k} | ${g.length} baris | ${first3} … ${last3} ${mono ? "✅" : "❌ TIDAK SEKUENSIAL"}`);
}
console.log(`\n${ok ? "✅ SEMUA grup urutan created_at menurun ketat = urutan sheet terjaga." : "❌ Ada grup yang tidak sekuensial!"}`);
process.exit(ok ? 0 : 1);