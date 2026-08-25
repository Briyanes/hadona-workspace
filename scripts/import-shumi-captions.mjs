/**
 * Import caption SHUMI Japan dari Google Sheet (published) → Supabase ads_captions
 * Struktur sheet: NO | PRODUK | _ | TEMA & ASET KONTEN | Headline | Caption | PerfGood | PerfNo
 * Run:  node scripts/import-shumi-captions.mjs --dry-run   (preview)
 *       node scripts/import-shumi-captions.mjs             (insert)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy/pub?gid=239752135&single=true&output=csv";
const CLIENT_NAME = "SHUMI Japan";
const TODAY = new Date().toISOString().slice(0, 10);
const DRY_RUN = process.argv.includes("--dry-run");

// ---------- RFC4180 CSV parser (supports quoted multiline) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const cleanTema = (t) => {
  const s = (t || "").replace(/\s+/g, " ").trim();
  if (s.includes(":")) return s.slice(s.indexOf(":") + 1).trim() || s;
  return s;
};

// ---------- main ----------
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const clients = await fetch(`${url}/rest/v1/clients?select=id,name&name=eq.${encodeURIComponent(CLIENT_NAME)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then((r) => r.json());
  if (!Array.isArray(clients) || !clients.length) throw new Error(`Client "${CLIENT_NAME}" tidak ditemukan`);
  const clientId = clients[0].id;
  console.log(`Client: ${CLIENT_NAME} → ${clientId}`);

  const csv = await (await fetch(SHEET_CSV)).text();
  const rows = parseCSV(csv.replace(/^\uFEFF/, ""));
  console.log(`CSV fetched: ${rows.length} physical rows`);

  let produk = "", tema = "";
  const items = [];
  const seen = new Set();
  let dup = 0, empty = 0;

  rows.forEach((row, idx) => {
    if (idx < 2) return; // 2 baris header (judul + Good/No)
    if ((row[0] || "").trim() === "PRODUK") return;

    if ((row[1] || "").trim()) produk = row[1].trim();
    if ((row[3] || "").trim()) tema = row[3].trim();

    const headline = (row[4] || "").trim();
    let caption = (row[5] || "").trim();
    if (!caption && !headline) { empty++; return; }
    if (headline && caption) caption = `${headline}\n\n${caption}`;
    else if (headline) caption = headline;

    const perf = (row[6] || "").trim() === "Good" ? "Good" : (row[7] || "").trim() === "No" ? "No" : null;
    const angle = [produk, cleanTema(tema)].filter(Boolean).join(" — ") + (perf ? ` (${perf})` : "");

    const key = caption.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) { dup++; return; }
    seen.add(key);

    items.push({ client_id: clientId, entry_date: TODAY, angle: angle || null, caption, created_by: null });
  });

  console.log(`Parsed: ${items.length} caption | dup skipped: ${dup} | empty skipped: ${empty}`);
  const perProduk = {};
  items.forEach((it) => {
    const p = (it.angle || "?").split(" — ")[0];
    perProduk[p] = (perProduk[p] || 0) + 1;
  });
  console.log("Per produk:", JSON.stringify(perProduk, null, 0));
  console.log("--- Sample 3 ---");
  items.slice(0, 3).forEach((it, i) =>
    console.log(`[${i + 1}] angle=${it.angle}\n${it.caption.slice(0, 120)}...\n`)
  );

  if (DRY_RUN) { console.log("DRY RUN — tidak insert."); return; }

  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  let inserted = 0;
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100);
    const res = await fetch(`${url}/rest/v1/ads_captions`, { method: "POST", headers, body: JSON.stringify(batch) });
    if (!res.ok) throw new Error(`Insert gagal batch ${i / 100 + 1}: ${res.status} ${await res.text()}`);
    inserted += batch.length;
    console.log(`Inserted batch ${i / 100 + 1}: +${batch.length} (total ${inserted})`);
  }

  const verify = await fetch(`${url}/rest/v1/ads_captions?select=id,angle&client_id=eq.${clientId}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then((r) => r.json());
  console.log(`\nVERIFY: ${Array.isArray(verify) ? verify.length : "?"} caption milik ${CLIENT_NAME} di DB`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });