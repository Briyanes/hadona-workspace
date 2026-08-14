#!/usr/bin/env node
/**
 * import-all-sheets-to-supabase.mjs (v3 — New Spreadsheet Format)
 *
 * Downloads all sheets from the published Google Spreadsheet (monthly format)
 * and imports them directly into Supabase tasks table using the service role key.
 *
 * NEW SPREADSHEET STRUCTURE:
 *   - Each sheet = one month (e.g. "August '26")
 *   - All divisions in ONE sheet (column "Divisi")
 *   - Columns: a, Input Date, Divisi, PIC, Client, Task Description, Result,
 *              Start Date, End Date, Status, Keterangan
 *
 * IDEMPOTENT — uses source_sheet + sheet_row_id for dedup.
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
const SPREADSHEET_ID = "2PACX-1vRxJxq-C1Sir4RkaLESmrtPuhciUPDm8dRGkWxh5YzIsnxJFfkG5jyd7RnzmU5DCHvY0eJIwVJJYkti";
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
// SCHEMA DETECTION
// ============================================================

let sourceSheetEnabled = false;

async function detectSchema() {
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
    // Decode HTML entities (e.g. \x27 → ')
    const name = m[1].replace(/\\x27/g, "'").replace(/\\x22/g, '"').trim();
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
        sheets.push({ name: m[2].replace(/\\x27/g, "'").trim(), gid: m[1] });
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
  if (l.includes("done") || l.includes("selesai") || l.includes("complete") || l === "✓" || l === "v" || l.includes("finished")) return "done";
  if (l.includes("progress") || l.includes("proses") || l.includes("doing") || l.includes("ongoing")) return "in_progress";
  if (l.includes("review") || l.includes("pending") || l.includes("cek")) return "review";
  if (l.includes("block") || l.includes("stuck") || l.includes("kendala") || l.includes("wait")) return "blocked";
  return "todo";
}

function getField(row, headers, ...names) {
  for (const fn of names) {
    const lf = fn.toLowerCase();
    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || "").toLowerCase();
      if (h === lf || h.includes(lf) || lf.includes(h)) return row[i] || "";
    }
  }
  return "";
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

  // Direct match
  if (clientMap[normalized]) return clientMap[normalized];

  // Partial match
  for (const [key, id] of Object.entries(clientMap)) {
    if (key.includes(normalized) || normalized.includes(key)) return id;
  }

  // Known aliases
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
    "moone bakery": "moone bakery",
    "moone": "moone bakery",
    "tombo ati": "tombo ati",
    "raha pro": "raha pro",
    "raha": "raha pro",
    "ybd": "yourbestdeal",
    "yourbestdeal": "yourbestdeal",
    "your best deal": "yourbestdeal",
    "all client": null,
    "all": null,
  };
  const aliasKey = normalized.replace(/[^a-z0-9 ]/g, "").trim();
  if (aliases[aliasKey] !== undefined) {
    const target = aliases[aliasKey];
    if (target && clientMap[target]) return clientMap[target];
  }
  return null;
}

// ============================================================
// DIVISION NORMALIZATION
// ============================================================

function normalizeDivision(rawDivisi, pic) {
  if (!rawDivisi) return null;
  const d = rawDivisi.toLowerCase().trim();

  // Map common variations to canonical names
  if (d.includes("creative director") || d.includes("cd")) return "Creative Director";
  if (d.includes("content creator") || d.includes("cc")) return "Content Creator";
  if (d.includes("editor") || d.includes("video editor")) return "Editor";
  if (d.includes("content production") || d.includes("production")) return "Content Production";
  if (d.includes("social media") || d.includes("smm")) return "Social Media Manager";
  if (d.includes("project manager") || d.includes("pm")) return "Project Manager";
  if (d.includes("advertiser") || d.includes("ads") || d.includes("ads specialist")) return "Advertiser";
  if (d.includes("account executive") || d.includes("ae")) return "Account Executive";
  if (d.includes("copywriter") || d.includes("cw")) return "Copywriter";
  if (d.includes("developer") || d.includes("dev")) return "Developer";

  // If PIC hints at a role
  if (pic) {
    const p = pic.toLowerCase();
    if (p.includes("editor")) return "Editor";
    if (p.includes("creative")) return "Creative Director";
  }

  return rawDivisi.trim();
}

// ============================================================
// FORCE CLEAR
// ============================================================

async function clearExisting(sheetName) {
  if (!FORCE) return;
  console.log(`  🗑️  [FORCE] Deleting existing "${sheetName}" rows from tasks...`);
  const { error } = await supabase.from("tasks").delete().eq("source_sheet", sheetName);
  if (error) console.error(`  ⚠️ Delete error: ${error.message}`);
}

// ============================================================
// TASK IMPORTER (NEW FORMAT — all divisions in one sheet)
// ============================================================

async function importTasks(csvText, sheetName, clientMap, userId) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { found: 0, inserted: 0, updated: 0, errors: 0, skipped: 0 };

  // Find header row — look for "Task Description" or "Divisi"
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].some((c) => (c || "").toLowerCase().includes("task description")) ||
        rows[i].some((c) => (c || "").toLowerCase().includes("divisi"))) {
      headerIdx = i; break;
    }
  }
  const headers = rows[headerIdx];
  const dataRows = rows.slice(headerIdx + 1);

  if (FORCE) await clearExisting(sheetName);

  let inserted = 0, updated = 0, errors = 0, skipped = 0;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];

    // Extract fields by header name
    const taskDesc = getField(row, headers, "task description", "task", "description", "deskripsi");
    const rawDivisi = getField(row, headers, "divisi", "division");
    const pic = getField(row, headers, "pic", "person in charge", "assignee");
    const rawClient = getField(row, headers, "client", "nama");
    const result = getField(row, headers, "result", "hasil", "output");
    const startDate = getField(row, headers, "start date", "start", "mulai");
    const endDate = getField(row, headers, "end date", "end", "selesai", "deadline", "due date");
    const rawStatus = getField(row, headers, "status");
    const notes = getField(row, headers, "keterangan", "notes", "note", "comment", "hambatan");
    const inputDate = getField(row, headers, "input date", "tanggal input");

    // Skip rows without a meaningful task description
    if (!taskDesc || taskDesc.length < 3) { skipped++; continue; }

    // Skip metadata rows
    const lower = taskDesc.toLowerCase();
    if (lower.startsWith("bulan") || lower.includes("login:") || lower.includes("email:") || lower.includes("password:")) { skipped++; continue; }

    // Skip "ALL CLIENT" umbrella rows that are really just section headers
    const isAllClient = rawClient && rawClient.toLowerCase().includes("all client");
    const hasMultipleClients = lower.includes("englishup") || lower.includes("nouban") || lower.includes("tpdoc");

    // Normalize division
    const division = normalizeDivision(rawDivisi, pic);

    // Match client
    const clientId = isAllClient ? null : matchClientId(rawClient, clientMap);

    // Determine due date: prefer end date, fallback to start date
    const dueDate = parseDate(endDate) || parseDate(startDate) || parseDate(inputDate);
    const taskStartDate = parseDate(startDate) || parseDate(inputDate);

    // Generate unique row ID for dedup
    const sheetRowId = `${sheetName}-row${rowIdx}`;

    const taskData = {
      title: taskDesc.length > 200 ? taskDesc.substring(0, 200) : taskDesc,
      description: taskDesc,
      result: result || null,
      status: mapStatus(rawStatus),
      priority: "medium",
      division: division || null,
      client_id: clientId,
      start_date: taskStartDate,
      due_date: dueDate,
      notes: notes || null,
      created_by: userId,
      ...(sourceSheetEnabled ? {
        source_sheet: sheetName,
        sheet_row_id: sheetRowId,
        result_link: result && result.startsWith("http") ? result : null,
        blockers: notes && (notes.toLowerCase().includes("kendala") || notes.toLowerCase().includes("hambat")) ? notes : null,
      } : {}),
    };

    if (DRY_RUN) { inserted++; continue; }

    // Idempotent upsert
    let existingId = null;

    if (sourceSheetEnabled) {
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .eq("source_sheet", taskData.source_sheet)
        .eq("sheet_row_id", taskData.sheet_row_id)
        .limit(1);
      if (existing && existing.length > 0) existingId = existing[0].id;
    } else {
      const { data: existing } = await supabase
        .from("tasks")
        .select("id")
        .ilike("title", taskData.title)
        .limit(1);
      if (existing && existing.length > 0) existingId = existing[0].id;
    }

    if (existingId) {
      const updateData = { ...taskData };
      if (sourceSheetEnabled) {
        delete updateData.source_sheet;
        delete updateData.sheet_row_id;
      }
      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", existingId);
      if (error) { errors++; if (errors <= 5) console.error(`  ❌ Update: ${error.message}`); }
      else { updated++; }
    } else {
      const insertData = sourceSheetEnabled ? taskData : (() => {
        const { source_sheet, sheet_row_id, result_link, blockers, ...rest } = taskData;
        return rest;
      })();

      const { error } = await supabase.from("tasks").insert(insertData);
      if (error) { errors++; if (errors <= 5) console.error(`  ❌ Insert: ${error.message}`); }
      else { inserted++; }
    }
  }

  return { found: dataRows.length, inserted, updated, errors, skipped };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=".repeat(60));
  console.log(`🚀 ${DRY_RUN ? "[DRY RUN] " : FORCE ? "[FORCE] " : ""}Import Monthly Task Sheets → Supabase (v3)`);
  console.log("=".repeat(60));
  console.log(`  Spreadsheet ID: ${SPREADSHEET_ID.substring(0, 20)}...`);

  // Step 1: Get user ID
  console.log("\n📋 Step 1: Getting system user...");
  const userId = await getSystemUserId();

  // Step 1.5: Detect schema
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
  console.log(`  Found ${sheets.length} sheet(s): ${sheets.map((s) => `"${s.name}"`).join(", ")}`);

  if (sheets.length === 0) {
    console.error("❌ No sheets found! Is the spreadsheet published?");
    console.error("   Go to: File → Share → Publish to web → Entire document");
    process.exit(1);
  }

  // Step 3: Download all sheets as CSV
  console.log("\n📋 Step 3: Downloading all sheets as CSV...");
  const csvData = [];
  for (const sheet of sheets) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv&gid=${sheet.gid}`;
    try {
      const res = await fetch(csvUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
        redirect: "follow",
      });
      const csv = await res.text();

      // Skip if it's an HTML redirect page
      if (csv.trim().startsWith("<HTML>") || csv.trim().startsWith("<!DOCTYPE")) {
        console.log(`  ⚠️ ${sheet.name}: got HTML redirect, retrying...`);
        // Try fetching the redirect URL directly
        const match = csv.match(/HREF="([^"]+)"/);
        if (match) {
          const res2 = await fetch(match[1], {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
          });
          const csv2 = await res2.text();
          csvData.push({ name: sheet.name, gid: sheet.gid, csv: csv2 });
          console.log(`  ✓ ${sheet.name} (${csv2.length} bytes)`);
        }
      } else {
        csvData.push({ name: sheet.name, gid: sheet.gid, csv });
        console.log(`  ✓ ${sheet.name} (${csv.length} bytes)`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to download "${sheet.name}": ${err.message}`);
    }
  }

  // Step 4: Build client map
  console.log("\n📋 Step 4: Loading existing clients...");
  const clientMap = await buildClientMap();

  // Step 5: Import all sheets as tasks
  console.log("\n📋 Step 5: Importing task sheets → tasks...");
  const allResults = [];

  for (const sheet of csvData) {
    console.log(`\n  📄 Sheet: "${sheet.name}"`);
    const result = await importTasks(sheet.csv, sheet.name, clientMap, userId);
    console.log(`  Found: ${result.found} | Inserted: ${result.inserted} | Updated: ${result.updated} | Skipped: ${result.skipped} | Errors: ${result.errors}`);
    allResults.push({ sheet: sheet.name, ...result });
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log(`${DRY_RUN ? "[DRY RUN] " : FORCE ? "[FORCE] " : ""}📊 IMPORT SUMMARY`);
  console.log("=".repeat(60));
  const totalFound = allResults.reduce((a, r) => a + r.found, 0);
  const totalInserted = allResults.reduce((a, r) => a + (r.inserted || 0), 0);
  const totalUpdated = allResults.reduce((a, r) => a + (r.updated || 0), 0);
  const totalSkipped = allResults.reduce((a, r) => a + (r.skipped || 0), 0);
  const totalErrors = allResults.reduce((a, r) => a + (r.errors || 0), 0);

  for (const r of allResults) {
    console.log(`  ${r.sheet.padEnd(25)} | F: ${String(r.found).padStart(4)} | N: ${String(r.inserted || 0).padStart(4)} | U: ${String(r.updated || 0).padStart(4)} | S: ${String(r.skipped || 0).padStart(4)} | E: ${String(r.errors || 0).padStart(4)}`);
  }
  console.log("  " + "-".repeat(80));
  console.log(`  ${"TOTAL".padEnd(25)} | F: ${String(totalFound).padStart(4)} | N: ${String(totalInserted).padStart(4)} | U: ${String(totalUpdated).padStart(4)} | S: ${String(totalSkipped).padStart(4)} | E: ${String(totalErrors).padStart(4)}`);
  console.log("");

  if (DRY_RUN) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to actually import.");
  } else if (totalErrors > 0) {
    console.log(`⚠️ ${totalErrors} errors occurred. Check above for details.`);
  } else {
    console.log("✅ Import completed successfully!");
  }

  // Tip if only 1 sheet found
  if (sheets.length === 1) {
    console.log("\n� Only 1 sheet found. To import all months:");
    console.log("   Go to Google Sheets → File → Share → Publish to web");
    console.log("   Select 'Entire document' (not just one sheet) → Publish");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});