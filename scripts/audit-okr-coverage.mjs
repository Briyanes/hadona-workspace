#!/usr/bin/env node
/** Audit read-only: client mana yang punya / kosong / kurang OKR */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: clients, error: e1 } = await sb.from("clients").select("id, name, industry, status").order("name");
if (e1) { console.error("clients error:", e1.message); process.exit(1); }
const { data: okrs, error: e2 } = await sb.from("okrs").select("client_id, objective, quarter, year");
if (e2) { console.error("okrs error:", e2.message); process.exit(1); }

const byClient = {};
for (const o of okrs || []) {
  byClient[o.client_id] = byClient[o.client_id] || { kr: 0, obj: new Set(), q: o.quarter, y: o.year };
  byClient[o.client_id].kr++;
  byClient[o.client_id].obj.add(o.objective);
}

console.log("=== SEMUA CLIENT & STATUS OKR ===");
for (const c of clients) {
  const s = byClient[c.id];
  console.log(
    (s ? "[OKR]  " : "[KOSONG]"),
    "|", c.name,
    "|", c.industry || "-",
    "|", c.status,
    s ? `| ${s.kr} KR / ${s.obj.size} obj / ${s.q} ${s.y}` : "| 0 KR"
  );
}

console.log("\n=== STRUKTUR OBJECTIVE (per client) ===");
const seen = new Set();
for (const o of okrs || []) {
  const k = o.client_id + "|" + o.objective;
  if (!seen.has(k)) {
    seen.add(k);
    const name = clients.find((c) => c.id === o.client_id)?.name || "?";
    console.log(`${name} :: ${o.objective}`);
  }
}