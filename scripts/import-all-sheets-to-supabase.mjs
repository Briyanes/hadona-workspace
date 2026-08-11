#!/usr/bin/env node
/**
 * import-all-sheets-to-supabase.mjs (v2 - Idempotent)
 *
 * Downloads all 7 sheets from the published Google Spreadsheet
 * and imports them directly into Supabase using the service role key.
 *
 * This version is IDEMPOTENT — uses source_sheet + sheet_row_id
 * to detect existing records and UPSERT instead of duplicate insert.
 *
 * Usage:
 *   node scripts/import-all-sheets-to-supabase.mjs
 *   node scripts/import-all-sheets-to-supabase.mjs --dry-run
 *   node scripts/import-all-sheets-to-supabase.mjs --force   (delete existing + re-import)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// ============================================================
// CONFIG
// ============================================================

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPREADSHEET_ID = "2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy";
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preview");
const FORCE = process.argv.includes("--force");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// SCHEMA DETECTION (backwards-compatible)
// ============================================================

let sourceSheetEnabled = false;

async function detectSchema() {
  // Check if tasks table has source_sheet column
  const { data, error } = await supabase
    .from("tasks")
    .select("source_sheet")
    .limit(1);

  if (!error) {
    sourceSheetEnabled = true;
    console.log("  ✓ Schema v80 detected (source_sheet columns available)");
  } else {
    console.log("  ℹ️ Schema v80 not yet applied — using fallback dedup mode");
  }
}

// ============================================================
// CSV PARSER
// ============================================================

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { currentRow.push(field.trim()); field = ""; i++; continue; }
    if (ch === "\r") {
      currentRow.push(field.trim()); rows.push(currentRow);
      currentRow = []; field = "";
      if (text[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    if (ch === "\n") {
      currentRow.push(field.trim()); rows.push(currentRow);
      currentRow = []; field = ""; i++; continue;
    }
    field += ch; i++;
  }
  if (field.length > 0 || currentRow.length > 0) {
    currentRow.push(field.trim()); rows.push(currentRow);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

// ============================================================
// SHEET DISCOVERY
// ============================================================

function extractSheetGids(html) {
  const sheets = [];
  const seen = new Set();

  const itemsRegex = /items\.push\(\{[^}]*name:\s*"([^"]+)"[^}]*gid:\s*"(\d+)"[^}]*\}\)/g;
  let m;
  while ((m = itemsRegex.exec(html)) !== null) {
    const name = m[1].trim();
    const gid = m[2];
    if (!seen.has(gid) && name.length > 0) {
      seen.add(gid);
      sheets.push({ name, gid });
    }
  }

  if (sheets.length === 0) {
    const regex = /"gid":"(\d+)","sheetName":"([^"]+)"/g;
    while ((m = regex.exec(html)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        sheets.push({ name: m[2], gid: m[1] });
      }
    }
  }

  if (sheets.length === 0) {
    const tabRegex = /<a[^>]*gid=(\d+)[^>]*>([^<]+)<\/a>/gi;
    while ((m = tabRegex.exec(html)) !== null) {
      const name = m[2].trim();
      if (!seen.has(m[1]) && name.length > 0) {
        seen.add(m[1]);
        sheets.push({ name, gid: m[1] });
      }
    }
  }

  return sheets;
}

// ============================================================
// HELPERS
// ============================================================

function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/\b(digital media|hadona)\b/gi, "").trim();
}

function parseDate(str) {
  if (!str || str.length < 3) return null;
  if (/^\d{4,5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (serial > 40000 && serial < 60000) {
      const date = new Date((serial - 25569) * 86400 * 1000);
      return date.toISOString().split("T")[0];
    }
  }
  const idMonths = { januari:"01",februari:"02",maret:"03",april:"04",mei:"05",juni:"06",juli:"07",agustus:"08",september:"09",oktober:"10",november:"11",desember:"12" };
  const enMonths = { january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",july:"07",august:"08",september:"09",october:"10",november:"11",december:"12" };
  const lower = str.toLowerCase().trim();
  const m = lower.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})/);
  if (m) {
    const day = m[1].padStart(2, "0");
    let year = m[3];
    if (year.length === 2) year = "20" + year;
    const month = idMonths[m[2]] || enMonths[m[2]];
    if (month) return `${year}-${month}-${day}`;
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().split("T")[0];
  return null;
}

function mapStatus(raw) {
  if (!raw) return "todo";
  const l = raw.toLowerCase().trim();
  if (l.includes("done") || l.includes("selesai") || l.includes("complete") || l === "✓" || l === "v") return "done";
  if (l.includes("progress") || l.includes("proses") || l.includes("doing")) return "in_progress";
  return "todo";
}

function getField(row, headers, ...names) {
  for (const fn of names) {
    const lf = fn.toLowerCase();
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase();
      if (h === lf || h.includes(lf) || lf.includes(h)) return row[i] || "";
    }
  }
  return "";
}

function getFieldByIndex(row, idx) {
  return row[idx] || "";
}

// ============================================================
// GET SYSTEM USER
// ============================================================

async function getSystemUserId() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (error || !data) {
    const { data: authUser } = await supabase.auth.admin.listUsers();
    if (authUser?.users?.length > 0) {
      return authUser.users[0].id;
    }
    throw new Error("No user found in profiles or auth.users");
  }
  console.log(`  Using system user: ${data.email || data.id}`);
  return data.id;
}

// ============================================================
// CLIENT MAP
// ============================================================

async function buildClientMap() {
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name");
  if (error) {
    console.error("❌ Failed to fetch clients:", error.message);
    return {};
  }
  const map = {};
  for (const c of clients) {
    map[normalizeName(c.name)] = c.id;
  }
  console.log(`  Loaded ${clients.length} existing clients`);
  return map;
}

function matchClientId(rawName, clientMap) {
  if (!rawName || rawName.length < 2) return null;
  const normalized = normalizeName(rawName);
  if (clientMap[normalized]) return clientMap[normalized];
  for (const [key, id] of Object.entries(clientMap)) {
    if (key.includes(normalized) || normalized.includes(key)) return id;
  }
  const aliases = {
    "shumijapan": "shumi japan",
    "shumi japan": "shumi japan",
    "three nine": "three nine",
    "threenine": "three nine",
    "23 trans": "23 trans",
    "english up": "englishup",
    "englishup": "englishup",
    "tpdoc": "tpdoc",
    "nouban": "nouban",
    "eja": "eja tour",
    "eja tour": "eja tour",
  };
  const aliasKey = normalized.replace(/[^a-z0-9 ]/g, "").trim();
  if (aliases[aliasKey] && clientMap[aliases[aliasKey]]) return clientMap[aliases[aliasKey]];
  return null;
}

// ============================================================
// IDEMPOTENT SYNC HELPER
// ============================================================

async function clearExisting(sheetName, table) {
  if (!FORCE) return;
  console.log(`  🗑️  [FORCE] Deleting existing "${sheetName}" rows from ${table}...`);
  const { error } = await supabase.from(table).delete().eq("source_sheet", sheetName);
  if (error) console.error(`  ⚠️ Delete error: ${error.message}`);
}

// ============================================================
// IMPORTERS
// ============================================================

async function importClients(csvText, clientMap, userId) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { found: 0, inserted: 0, updated: 0, errors: 0 };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => c.toLowerCase().includes("client")) ||
        rows[i].some((c) => c.toLowerCase().includes("service"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  const clientNames = new Map(); // name -> services[]
  for (const row of dataRows) {
    const name = getField(row, headers, "client", "nama", "name");
    if (name && name.length > 1) {
      const lower = name.toLowerCase();
      if (lower.includes("bulan:") || lower.includes("milanote")) continue;
      const svc = getField(row, headers, "service", "layanan");
      if (!clientNames.has(name)) clientNames.set(name, []);
      if (svc && !clientNames.get(name).includes(svc)) clientNames.get(name).push(svc);
    }
  }

  let inserted = 0, updated = 0, errors = 0;

  for (const [name, services] of clientNames) {
    const normalized = normalizeName(name);
    const existingId = clientMap[normalized];

    if (DRY_RUN) { inserted++; continue; }

    if (existingId) {
      // Update existing client
      const { error } = await supabase
        .from("clients")
        .update({ services: services.length > 0 ? services : ["Social Media Management"] })
        .eq("id", existingId);
      if (error) { errors++; } else { updated++; }
    } else {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name,
          slug,
          status: "active",
          services: services.length > 0 ? services : ["Social Media Management"],
        })
        .select("id")
        .single();
      if (error) { errors++; console.error(`  ❌ Client "${name}": ${error.message}`); }
      else { clientMap[normalized] = data.id; inserted++; console.log(`  ✅ Created client: ${name}`); }
    }
  }
  return { found: clientNames.size, inserted, updated, errors };
}

async function importTasks(csvText, sheetName, division, clientMap, userId) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { found: 0, inserted: 0, updated: 0, errors: 0 };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => c.toLowerCase().includes("task")) ||
        rows[i].some((c) => c.toLowerCase().includes("date"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  const tasksToUpsert = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    let title = getField(row, headers, "task description", "task", "description", "deskripsi", "activity", "kegiatan");
    if (!title) {
      for (const idx of [4, 3, 5, 2]) {
        const val = getFieldByIndex(row, idx);
        if (val && val.length > 5 && !val.match(/^\d+$/)) { title = val; break; }
      }
    }
    if (!title || title.length < 3) continue;
    const lower = title.toLowerCase();
    if (lower.startsWith("bulan") || lower.includes("login:") || lower.includes("email:")) continue;

    const rawClient = getField(row, headers, "client", "nama", "client name");
    const clientId = matchClientId(rawClient, clientMap);
    const rawDate = getField(row, headers, "to-do date", "todo date", "date", "tanggal", "due date", "deadline");
    const startDate = getField(row, headers, "start date", "start", "mulai");
    const endDate = getField(row, headers, "end date", "end", "selesai");
    const result = getField(row, headers, "result", "hasil");
    const notes = getField(row, headers, "keterangan", "notes", "note", "comment");
    const rawStatus = getField(row, headers, "status");

    // Generate unique row ID for dedup (used if columns exist)
    const sheetRowId = `${rawClient || "unknown"}-${rowIdx}`;

    tasksToUpsert.push({
      title: title.length > 200 ? title.substring(0, 200) : title,
      description: title,
      result: result || null,
      status: mapStatus(rawStatus),
      priority: "medium",
      division,
      client_id: clientId,
      start_date: parseDate(startDate || rawDate),
      due_date: parseDate(endDate || rawDate),
      notes: notes || null,
      created_by: userId,
      // Optional fields (require migration v80)
      ...(sourceSheetEnabled ? {
        source_sheet: sheetName,
        sheet_row_id: sheetRowId,
        result_link: result && result.startsWith("http") ? result : null,
        blockers: notes && notes.toLowerCase().includes("kendala") ? notes : null,
      } : {}),
      _dedupKey: `${title.substring(0, 100)}|${division}|${clientId || "none"}`,
    });
  }

  if (DRY_RUN || tasksToUpsert.length === 0) {
    return { found: tasksToUpsert.length, inserted: tasksToUpsert.length, updated: 0, errors: 0 };
  }

  // Check for existing rows (idempotent upsert)
  let inserted = 0, updated = 0, errors = 0;

  for (const task of tasksToUpsert) {
    // Remove internal-only field before DB operation
    const dedupKey = task._dedupKey;
    delete task._dedupKey;

    let existingId = null;

    if (sourceSheetEnabled) {
      // Dedup by source_sheet + sheet_row_id
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("source_sheet", task.source_sheet)
        .eq("sheet_row_id", task.sheet_row_id)
        .limit(1);
      if (existing && existing.length > 0) existingId = existing[0].id;
    } else {
      // Fallback dedup by title + division (avoid exact duplicates)
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .ilike("title", task.title)
        .eq("division", task.division)
        .limit(1);
      if (existing && existing.length > 0) existingId = existing[0].id;
    }

    if (existingId) {
      // Update existing
      const { error } = await supabase
        .from("tasks")
        .update({
          title: task.title,
          description: task.description,
          result: task.result,
          status: task.status,
          client_id: task.client_id,
          start_date: task.start_date,
          due_date: task.due_date,
          notes: task.notes,
          ...(sourceSheetEnabled ? {
            result_link: task.result_link,
            blockers: task.blockers,
          } : {}),
        })
        .eq("id", existingId);
      if (error) { errors++; } else { updated++; }
    } else {
      // Insert new — strip optional v80 fields if schema not applied
      const insertData = sourceSheetEnabled ? task : (() => {
        const { source_sheet, sheet_row_id, result_link, blockers, ...rest } = task;
        return rest;
      })();

      const { error } = await supabase.from("tasks").insert(insertData);
      if (error) { errors++; if (errors <= 3) console.error(`  ❌ ${error.message}`); }
      else { inserted++; }
    }
  }
  return { found: tasksToUpsert.length, inserted, updated, errors };
}

async function importContentUploads(csvText, clientMap, userId) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { found: 0, inserted: 0, updated: 0, errors: 0 };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => c.toLowerCase().includes("caption")) ||
        rows[i].some((c) => c.toLowerCase().includes("upload"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  const uploads = [];
  for (const row of dataRows) {
    const caption = getField(row, headers, "caption");
    const rawClient = getField(row, headers, "client", "nama");
    const briefNo = getField(row, headers, "brief", "brief no");
    const contentLink = getField(row, headers, "link content", "link", "content link");
    if ((!caption || caption.length < 3) && (!contentLink || contentLink.length < 3)) continue;

    const clientId = matchClientId(rawClient, clientMap);
    const rawDate = getField(row, headers, "to-do date", "todo date", "date", "upload date", "tanggal");
    const rawDivision = getField(row, headers, "divisi", "division");
    const rawStatus = getField(row, headers, "status");
    const notes = getField(row, headers, "keterangan", "notes");

    uploads.push({
      client_id: clientId,
      upload_date: parseDate(rawDate) || new Date().toISOString().split("T")[0],
      division: rawDivision || "Social Media Management",
      brief_no: briefNo || null,
      caption: caption || null,
      content_link: contentLink || null,
      status: mapStatus(rawStatus),
      notes: notes || null,
      created_by: userId,
    });
  }

  if (DRY_RUN || uploads.length === 0) {
    return { found: uploads.length, inserted: uploads.length, updated: 0, errors: 0 };
  }

  let inserted = 0, errors = 0;
  const BATCH = 100;
  for (let i = 0; i < uploads.length; i += BATCH) {
    const batch = uploads.slice(i, i + BATCH);
    const { error } = await supabase.from("content_uploads").insert(batch);
    if (error) {
      errors += batch.length;
      console.error(`  ❌ Batch ${i / BATCH + 1}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  return { found: uploads.length, inserted, updated: 0, errors };
}

async function importCaptionBank(csvText, clientMap, userId) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { found: 0, inserted: 0, updated: 0, errors: 0 };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => c.toLowerCase().includes("product")) ||
        rows[i].some((c) => c.toLowerCase().includes("produk"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];

  let productCol = 0, themeCol = 1, headlineCol = 2, captionCol = 3, perfCol = 4;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes("product") || h.includes("produk")) productCol = i;
    else if (h.includes("tema") || h.includes("theme")) themeCol = i;
    else if (h.includes("primary") || h.includes("headline") || h.includes("text")) headlineCol = i;
    else if (h.includes("caption")) captionCol = i;
    else if (h.includes("performance") || h.includes("perform") || h.includes("good")) perfCol = i;
  }

  let currentProduct = "", currentTheme = "";
  const clientId = matchClientId("ShumiJapan", clientMap);
  const captions = [];
  const dataRows = rows.slice(headerIdx + 1);

  for (const row of dataRows) {
    const product = (row[productCol] || "").trim();
    const theme = (row[themeCol] || "").trim();
    const headline = (row[headlineCol] || "").trim();
    const caption = (row[captionCol] || "").trim();
    const performance = (row[perfCol] || "").trim();

    if (product) currentProduct = product;
    if (theme) currentTheme = theme;

    if ((!headline || headline.length < 3) && (!caption || caption.length < 5)) continue;
    if (headline.toLowerCase().includes("primary text") && !caption) continue;

    const perfValue = performance.toLowerCase().includes("good") ? "good"
      : performance.toLowerCase().includes("no") ? "poor" : "untested";

    captions.push({
      client_id: clientId,
      product: currentProduct || null,
      theme: currentTheme || null,
      headline: headline || null,
      caption: caption || null,
      hashtags: null,
      performance: perfValue,
      created_by: userId,
    });
  }

  if (DRY_RUN || captions.length === 0) {
    return { found: captions.length, inserted: captions.length, updated: 0, errors: 0 };
  }

  let inserted = 0, errors = 0;
  const BATCH = 100;
  for (let i = 0; i < captions.length; i += BATCH) {
    const batch = captions.slice(i, i + BATCH);
    const { error } = await supabase.from("caption_bank").insert(batch);
    if (error) {
      errors += batch.length;
      console.error(`  ❌ Batch ${i / BATCH + 1}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }
  return { found: captions.length, inserted, updated: 0, errors };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log(`🚀 ${DRY_RUN ? "[DRY RUN] " : FORCE ? "[FORCE] " : ""}Import All Sheets to Supabase (v2)`);
  console.log("=".repeat(60));

  // Step 1: Get user ID
  console.log("\n📋 Step 1: Getting system user...");
  const userId = await getSystemUserId();

  // Step 1.5: Detect schema capabilities
  console.log("\n📋 Step 1.5: Detecting schema...");
  await detectSchema();

  // Step 2: Discover sheets
  console.log("\n📋 Step 2: Discovering sheets from published Google Sheet...");
  const pubhtmlUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pubhtml`;
  const htmlRes = await fetch(pubhtmlUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
  });
  if (!htmlRes.ok) {
    console.error(`❌ Failed to fetch pubhtml (HTTP ${htmlRes.status})`);
    process.exit(1);
  }
  const html = await htmlRes.text();
  const sheets = extractSheetGids(html);
  console.log(`  Found ${sheets.length} sheets: ${sheets.map((s) => s.name).join(", ")}`);

  if (sheets.length === 0) {
    console.error("❌ No sheets found! Is the spreadsheet published?");
    process.exit(1);
  }

  // Step 3: Download all sheets as CSV
  console.log("\n📋 Step 3: Downloading all sheets as CSV...");
  const csvData = [];
  for (const sheet of sheets) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv&gid=${sheet.gid}`;
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
    });
    const csv = await res.text();
    csvData.push({ name: sheet.name, gid: sheet.gid, csv });
    console.log(`  ✓ ${sheet.name} (${csv.length} bytes)`);
  }

  // Step 4: Build client map
  console.log("\n📋 Step 4: Loading existing clients...");
  const clientMap = await buildClientMap();

  const allResults = [];

  // Step 5: Import Dashboard Client → clients
  console.log("\n📋 Step 5: Importing Dashboard Client → clients...");
  const dashboardCsv = csvData.find((c) => c.name.toLowerCase().includes("dashboard"));
  if (dashboardCsv) {
    const result = await importClients(dashboardCsv.csv, clientMap, userId);
    console.log(`  Found: ${result.found} | Inserted: ${result.inserted} | Updated: ${result.updated} | Errors: ${result.errors}`);
    allResults.push({ sheet: "Dashboard Client", ...result });
  } else {
    console.log("  ⚠️ No Dashboard Client sheet found, skipping client creation");
  }

  // Step 6: Import task sheets (idempotent upsert)
  console.log("\n📋 Step 6: Importing task sheets → tasks (idempotent upsert)...");
  const taskMappings = [
    { pattern: "content production", division: "Content Production" },
    { pattern: "creative director", division: "Creative Director" },
    { pattern: "social media manager", division: "Social Media Management" },
    { pattern: "editor", division: "Editor" },
  ];
  for (const mapping of taskMappings) {
    const csvItem = csvData.find((c) => c.name.toLowerCase().includes(mapping.pattern));
    if (csvItem) {
      console.log(`\n  📄 Sheet: "${csvItem.name}" → division: "${mapping.division}"`);
      const result = await importTasks(csvItem.csv, csvItem.name, mapping.division, clientMap, userId);
      console.log(`  Found: ${result.found} | Inserted: ${result.inserted} | Updated: ${result.updated} | Errors: ${result.errors}`);
      allResults.push({ sheet: csvItem.name, ...result });
    } else {
      console.log(`  ⚠️ No sheet matching "${mapping.pattern}" found`);
    }
  }

  // Step 7: Import SMM Upload → content_uploads
  console.log("\n📋 Step 7: Importing SMM Upload → content_uploads...");
  const smmCsv = csvData.find((c) =>
    c.name.toLowerCase().includes("smm upload") || c.name.toLowerCase().includes("upload")
  );
  if (smmCsv) {
    if (FORCE) await clearExisting("SMM Upload", "content_uploads");
    const result = await importContentUploads(smmCsv.csv, clientMap, userId);
    console.log(`  Found: ${result.found} | Inserted: ${result.inserted} | Errors: ${result.errors}`);
    allResults.push({ sheet: "SMM Upload", ...result });
  } else {
    console.log("  ⚠️ No SMM Upload sheet found");
  }

  // Step 8: Import Bank Caption Ads → caption_bank
  console.log("\n📋 Step 8: Importing Bank Caption Ads → caption_bank...");
  const capCsv = csvData.find((c) =>
    c.name.toLowerCase().includes("caption") || c.name.toLowerCase().includes("bank")
  );
  if (capCsv) {
    if (FORCE) await clearExisting("Bank Caption Ads", "caption_bank");
    const result = await importCaptionBank(capCsv.csv, clientMap, userId);
    console.log(`  Found: ${result.found} | Inserted: ${result.inserted} | Errors: ${result.errors}`);
    allResults.push({ sheet: "Bank Caption Ads", ...result });
  } else {
    console.log("  ⚠️ No Bank Caption Ads sheet found");
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`${DRY_RUN ? "[DRY RUN] " : FORCE ? "[FORCE] " : ""}📊 IMPORT SUMMARY`);
  console.log("=".repeat(60));
  const totalFound = allResults.reduce((a, r) => a + r.found, 0);
  const totalInserted = allResults.reduce((a, r) => a + (r.inserted || 0), 0);
  const totalUpdated = allResults.reduce((a, r) => a + (r.updated || 0), 0);
  const totalErrors = allResults.reduce((a, r) => a + (r.errors || 0), 0);

  for (const r of allResults) {
    console.log(`  ${r.sheet.padEnd(25)} | Found: ${String(r.found).padStart(4)} | New: ${String(r.inserted || 0).padStart(4)} | Upd: ${String(r.updated || 0).padStart(4)} | Err: ${String(r.errors || 0).padStart(4)}`);
  }
  console.log("  " + "-".repeat(72));
  console.log(`  ${"TOTAL".padEnd(25)} | Found: ${String(totalFound).padStart(4)} | New: ${String(totalInserted).padStart(4)} | Upd: ${String(totalUpdated).padStart(4)} | Err: ${String(totalErrors).padStart(4)}`);
  console.log("");

  if (DRY_RUN) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to actually import.");
  } else if (totalErrors > 0) {
    console.log(`⚠️ ${totalErrors} errors occurred. Check above for details.`);
  } else {
    console.log("✅ Import completed successfully!");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});