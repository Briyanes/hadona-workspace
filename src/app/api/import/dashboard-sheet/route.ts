import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser, applyRateLimit } from "@/lib/auth-api";

/**
 * POST /api/import/dashboard-sheet
 *
 * Imports ALL sheets from a published Google Spreadsheet into the Hadona dashboard database.
 *
 * Mapping:
 *   Sheet 1: Dashboard Client      → clients
 *   Sheet 2: Content Production    → tasks (division: "Content Production")
 *   Sheet 3: Creative Director     → tasks (division: "Creative Director")
 *   Sheet 4: Social Media Manager  → tasks (division: "Social Media Management")
 *   Sheet 5: Editor                → tasks (division: "Editor")
 *   Sheet 6: SMM Upload            → content_uploads
 *   Sheet 7: Bank Caption Ads      → caption_bank
 *
 * Body params:
 *   - sheetUrl: Published Google Sheet URL (pubhtml or pub?format=...)
 *   - dryRun?: boolean — if true, only parse & return counts without DB writes
 */

// ============================================================
// TYPES
// ============================================================

interface ImportSummary {
  sheet: string;
  table: string;
  found: number;
  inserted: number;
  skipped: number;
  errors: number;
  details: string[];
}

interface ClientMap {
  [key: string]: string; // normalized name → client UUID
}

// ============================================================
// CSV PARSING
// ============================================================

/**
 * Robust CSV parser that handles quoted fields, embedded newlines, and commas.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  // Remove BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        // Handle \r\n or standalone \r
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        // Skip \n if it follows
        if (text[i + 1] === "\n") i += 2;
        else i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field/row if non-empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((c) => c.length > 0));
}

/**
 * Extract sheet gid values from the published HTML page.
 * Each sheet tab has a unique gid (e.g., gid=0, gid=123456789).
 */
function extractSheetGids(html: string): Array<{ name: string; gid: string }> {
  const sheets: Array<{ name: string; gid: string }> = [];
  const seen = new Set<string>();

  // Pattern: listEntries({"gid":"123","sheetName":"Sheet Name", ...})
  const listEntriesRegex =
    /"gid":"(\d+)","sheetName":"([^"]+)"/g;

  let match;
  while ((match = listEntriesRegex.exec(html)) !== null) {
    const gid = match[1];
    const name = match[2];
    if (!seen.has(gid)) {
      seen.add(gid);
      sheets.push({ name, gid });
    }
  }

  // Fallback: parse from page tabs if listEntries not found
  if (sheets.length === 0) {
    const tabRegex =
      /<a[^>]*gid=(\d+)[^>]*>([^<]+)<\/a>/gi;
    while ((match = tabRegex.exec(html)) !== null) {
      const gid = match[1];
      const name = match[2].trim();
      if (!seen.has(gid) && name.length > 0) {
        seen.add(gid);
        sheets.push({ name, gid });
      }
    }
  }

  return sheets;
}

/**
 * Extract the base spreadsheet ID from a published Google Sheets URL.
 */
function extractSpreadsheetBase(url: string): string {
  // Matches: 2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy
  const match = url.match(
    /2PACX-1v[A-Za-z0-9_-]+/
  );
  if (match) return match[0];

  // Try regular spreadsheet ID format
  const altMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (altMatch) return altMatch[1];

  return "";
}

// ============================================================
// DATA TRANSFORM HELPERS
// ============================================================

/**
 * Normalize a client name for matching (lowercase, remove extra spaces & common suffixes).
 */
function normalizeClientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(digital media|hadona)\b/gi, "")
    .trim();
}

/**
 * Try to match a spreadsheet client name to an existing client in the DB.
 */
function matchClientId(
  rawName: string | undefined,
  clientMap: ClientMap
): string | null {
  if (!rawName || rawName.length < 2) return null;

  const normalized = normalizeClientName(rawName);

  // Exact normalized match
  if (clientMap[normalized]) return clientMap[normalized];

  // Partial match: check if any key contains the normalized name or vice versa
  for (const [key, id] of Object.entries(clientMap)) {
    if (
      key.includes(normalized) ||
      normalized.includes(key)
    ) {
      return id;
    }
  }

  // Common alias mapping
  const aliases: Record<string, string> = {
    "shumijapan": "shumi japan",
    "shumi japan": "shumi japan",
    "three nine": "three nine",
    "threenine": "three nine",
    "23 trans": "23 trans",
    "23 trans & tour": "23 trans",
    "23 trans tour": "23 trans",
    "english up": "englishup",
    "englishup": "englishup",
    "english up (eop)": "englishup",
    "tpdoc": "tpdoc",
    "nouban": "nouban",
    "hadona": "hadona digital media",
    "hadona digital": "hadona digital media",
    "hadona digital media": "hadona digital media",
    "eja": "eja tour",
    "eja tour": "eja tour",
    "eja tour & travel": "eja tour",
  };

  const aliasKey = normalized.replace(/[^a-z0-9 ]/g, "").trim();
  if (aliases[aliasKey]) {
    const aliasTarget = aliases[aliasKey];
    if (clientMap[aliasTarget]) return clientMap[aliasTarget];
  }

  return null;
}

/**
 * Parse a date string from the spreadsheet (e.g., "10 June 2026", "10 Juni 2026").
 */
function parseSheetDate(dateStr: string): string | null {
  if (!dateStr || dateStr.length < 4) return null;

  // Indonesian month names
  const idMonths: Record<string, string> = {
    januari: "01", february: "02", maret: "03", april: "04",
    mei: "05", juni: "06", juli: "07", agustus: "08",
    september: "09", oktober: "10", november: "11", desember: "12",
  };
  const enMonths: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };

  const lower = dateStr.toLowerCase().trim();

  // Format: "DD Month YYYY" or "DD-Mon-YY"
  const match = lower.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const monthName = match[2];
    let year = match[3];
    if (year.length === 2) year = "20" + year;

    const month = idMonths[monthName] || enMonths[monthName];
    if (month) return `${year}-${month}-${day}`;
  }

  // Try Date.parse for ISO formats
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split("T")[0];
  }

  return null;
}

/**
 * Map a spreadsheet status string to database status.
 */
function mapStatus(raw: string | undefined): string {
  if (!raw) return "todo";
  const lower = raw.toLowerCase().trim();
  if (
    lower.includes("done") ||
    lower.includes("selesai") ||
    lower.includes("complete") ||
    lower === "✓" ||
    lower === "v"
  ) {
    return "done";
  }
  if (
    lower.includes("progress") ||
    lower.includes("proses") ||
    lower.includes("doing")
  ) {
    return "in-progress";
  }
  if (lower.includes("pending") || lower.includes("wait")) {
    return "todo";
  }
  return "todo";
}

/**
 * Get field value from a row by header name (fuzzy match).
 */
function getField(
  row: string[],
  headers: string[],
  ...fieldNames: string[]
): string {
  for (const fname of fieldNames) {
    const lowerFname = fname.toLowerCase();
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase();
      if (
        header === lowerFname ||
        header.includes(lowerFname) ||
        lowerFname.includes(header)
      ) {
        return row[i] || "";
      }
    }
  }
  return "";
}

/**
 * Get field value by column index.
 */
function getFieldByIndex(row: string[], index: number): string {
  return row[index] || "";
}

// ============================================================
// SHEET IMPORTERS
// ============================================================

/**
 * Import "Dashboard Client" sheet → clients table
 */
async function importDashboardClient(
  csvText: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean
): Promise<{ summary: ImportSummary; clientMap: ClientMap }> {
  const summary: ImportSummary = {
    sheet: "Dashboard Client",
    table: "clients",
    found: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const rows = parseCSV(csvText);
  if (rows.length < 2) return { summary, clientMap: {} };

  // Find the header row (contains "Client" or "Service")
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (
      rows[i].some((c) => c.toLowerCase().includes("client")) ||
      rows[i].some((c) => c.toLowerCase().includes("service"))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];
  const dataRows = rows.slice(headerRowIdx + 1);

  // Collect unique client names
  const clientNames = new Set<string>();

  for (const row of dataRows) {
    const name = getField(row, headers, "client", "nama", "name");
    if (name && name.length > 1) {
      // Skip section headers
      if (name.toLowerCase().includes("bulan:") || name.toLowerCase().includes("milanote")) continue;
      clientNames.add(name);
    }
  }

  summary.found = clientNames.size;

  // Fetch existing clients
  const { data: existingClients } = await supabase
    .from("clients")
    .select("id, name, services, notes");

  const clientMap: ClientMap = {};
  for (const c of existingClients as unknown as Array<{
    id: string;
    name: string;
    services?: string[];
    notes?: string;
  }>) {
    clientMap[normalizeClientName(c.name)] = c.id;
  }

  if (dryRun) {
    summary.inserted = clientNames.size;
    return { summary, clientMap };
  }

  // Insert new clients
  for (const name of Array.from(clientNames)) {
    const normalized = normalizeClientName(name);
    if (clientMap[normalized]) {
      summary.skipped++;
      continue;
    }

    const services: string[] = [];
    // Find services for this client
    for (const row of dataRows) {
      const clientName = getField(row, headers, "client", "nama", "name");
      if (normalizeClientName(clientName) === normalized) {
        const svc = getField(row, headers, "service", "layanan");
        if (svc && !services.includes(svc)) services.push(svc);
      }
    }

    const { data: newClient, error } = await supabase
      .from("clients")
      .insert({
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        status: "active",
        services: services.length > 0 ? services : ["Social Media Management"],
      } as never)
      .select("id, name")
      .single();

    if (error) {
      summary.errors++;
      summary.details.push(`❌ Error creating client "${name}": ${error.message}`);
    } else if (newClient) {
      const c = newClient as unknown as { id: string; name: string };
      clientMap[normalized] = c.id;
      summary.inserted++;
      summary.details.push(`✅ Created client: ${name}`);
    }
  }

  return { summary, clientMap };
}

/**
 * Import task-based sheets (Content Production, Creative Director, SMM, Editor) → tasks table
 */
async function importTaskSheet(
  csvText: string,
  sheetName: string,
  division: string,
  clientMap: ClientMap,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    sheet: sheetName,
    table: "tasks",
    found: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const rows = parseCSV(csvText);
  if (rows.length < 2) return summary;

  // Find header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (
      rows[i].some((c) => c.toLowerCase().includes("task") || rows[i].some((c) => c.toLowerCase().includes("date")))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];
  const dataRows = rows.slice(headerRowIdx + 1);

  summary.found = 0;

  for (const row of dataRows) {
    // Task description or title is the main field
    let title = getField(
      row,
      headers,
      "task description",
      "task",
      "description",
      "deskripsi",
      "activity",
      "kegiatan"
    );

    // If no title found via header matching, try by column position
    if (!title) {
      // Most task sheets have: No, Date, Divisi, Client, Task, ...
      // Task is typically column index 4 (E) or 3 (D)
      for (const idx of [4, 3, 5, 2]) {
        const val = getFieldByIndex(row, idx);
        if (val && val.length > 5 && !val.match(/^\d+$/)) {
          title = val;
          break;
        }
      }
    }

    if (!title || title.length < 3) continue;
    // Skip section headers
    if (
      title.toLowerCase().startsWith("bulan") ||
      title.toLowerCase().includes("login:") ||
      title.toLowerCase().includes("email:")
    )
      continue;

    summary.found++;

    if (dryRun) continue;

    const rawClient = getField(row, headers, "client", "nama", "client name");
    const clientId = matchClientId(rawClient, clientMap);

    const rawDate = getField(
      row,
      headers,
      "to-do date",
      "todo date",
      "date",
      "tanggal",
      "due date",
      "deadline"
    );
    const startDate = getField(
      row,
      headers,
      "start date",
      "start",
      "mulai"
    );
    const endDate = getField(
      row,
      headers,
      "end date",
      "end",
      "selesai"
    );

    const result = getField(row, headers, "result", "hasil");
    const notes = getField(
      row,
      headers,
      "keterangan",
      "notes",
      "note",
      "comment"
    );
    const rawStatus = getField(row, headers, "status");

    const dueDate = parseSheetDate(endDate || rawDate);

    const { error } = await supabase.from("tasks").insert({
      title: title.length > 200 ? title.substring(0, 200) : title,
      description: title,
      result: result || null,
      status: mapStatus(rawStatus),
      priority: "medium",
      division,
      client_id: clientId,
      start_date: parseSheetDate(startDate || rawDate),
      due_date: dueDate,
      notes: notes || null,
      created_by: userId,
    } as never);

    if (error) {
      summary.errors++;
      if (summary.errors <= 5)
        summary.details.push(`❌ Error: ${error.message}`);
    } else {
      summary.inserted++;
    }
  }

  if (dryRun) {
    summary.inserted = summary.found;
  }

  return summary;
}

/**
 * Import "SMM Upload" sheet → content_uploads table
 */
async function importSmmUpload(
  csvText: string,
  clientMap: ClientMap,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    sheet: "SMM Upload",
    table: "content_uploads",
    found: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const rows = parseCSV(csvText);
  if (rows.length < 2) return summary;

  // Find header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (
      rows[i].some((c) => c.toLowerCase().includes("caption")) ||
      rows[i].some((c) => c.toLowerCase().includes("upload"))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];
  const dataRows = rows.slice(headerRowIdx + 1);

  for (const row of dataRows) {
    const caption = getField(row, headers, "caption");
    const rawClient = getField(row, headers, "client", "nama");
    const briefNo = getField(row, headers, "brief", "brief no");
    const contentLink = getField(
      row,
      headers,
      "link content",
      "link",
      "content link"
    );

    // Must have at least caption or content link
    if ((!caption || caption.length < 3) && (!contentLink || contentLink.length < 3))
      continue;

    summary.found++;

    if (dryRun) continue;

    const clientId = matchClientId(rawClient, clientMap);
    const rawDate = getField(
      row,
      headers,
      "to-do date",
      "todo date",
      "date",
      "upload date",
      "tanggal"
    );
    const rawDivision = getField(row, headers, "divisi", "division");
    const rawStatus = getField(row, headers, "status");
    const notes = getField(row, headers, "keterangan", "notes");

    const { error } = await supabase.from("content_uploads").insert({
      client_id: clientId,
      upload_date: parseSheetDate(rawDate) || new Date().toISOString().split("T")[0],
      division: rawDivision || "Social Media Management",
      brief_no: briefNo || null,
      caption: caption || null,
      content_link: contentLink || null,
      status: mapStatus(rawStatus),
      notes: notes || null,
      created_by: userId,
    } as never);

    if (error) {
      summary.errors++;
      if (summary.errors <= 5)
        summary.details.push(`❌ Error: ${error.message}`);
    } else {
      summary.inserted++;
    }
  }

  if (dryRun) summary.inserted = summary.found;

  return summary;
}

/**
 * Import "Bank Caption Ads" sheet → caption_bank table
 */
async function importCaptionBank(
  csvText: string,
  clientMap: ClientMap,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  dryRun: boolean
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    sheet: "Bank Caption Ads",
    table: "caption_bank",
    found: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const rows = parseCSV(csvText);
  if (rows.length < 2) return summary;

  // This sheet has a complex structure: Product → Theme → Headline → Caption → Performance
  // We need to track the current product and theme as we iterate (merged cells style)
  let currentProduct = "";
  let currentTheme = "";
  let clientName = "ShumiJapan"; // Default client for this sheet

  // Determine header row
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (
      rows[i].some((c) => c.toLowerCase().includes("product")) ||
      rows[i].some((c) => c.toLowerCase().includes("produk"))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = rows[headerRowIdx];

  // Detect column indices based on header
  let productCol = 0,
    themeCol = 1,
    headlineCol = 2,
    captionCol = 3,
    perfCol = 4;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (h.includes("product") || h.includes("produk")) productCol = i;
    else if (h.includes("tema") || h.includes("theme")) themeCol = i;
    else if (h.includes("primary") || h.includes("headline") || h.includes("text"))
      headlineCol = i;
    else if (h.includes("caption")) captionCol = i;
    else if (h.includes("performance") || h.includes("perform") || h.includes("good"))
      perfCol = i;
  }

  const dataRows = rows.slice(headerRowIdx + 1);
  const clientId = matchClientId(clientName, clientMap);

  for (const row of dataRows) {
    // Track merged-cell values (if cell is non-empty, update current)
    const product = (row[productCol] || "").trim();
    const theme = (row[themeCol] || "").trim();
    const headline = (row[headlineCol] || "").trim();
    const caption = (row[captionCol] || "").trim();
    const performance = (row[perfCol] || "").trim();

    if (product) currentProduct = product;
    if (theme) currentTheme = theme;

    // Need at least headline or caption
    if ((!headline || headline.length < 3) && (!caption || caption.length < 5))
      continue;

    // Skip section/heading rows
    if (
      headline.toLowerCase().includes("primary text") &&
      !caption
    )
      continue;

    summary.found++;

    if (dryRun) continue;

    const perfValue =
      performance.toLowerCase().includes("good")
        ? "good"
        : performance.toLowerCase().includes("no")
        ? "poor"
        : "untested";

    const { error } = await supabase.from("caption_bank").insert({
      client_id: clientId,
      product: currentProduct || null,
      theme: currentTheme || null,
      headline: headline || null,
      caption: caption || null,
      hashtags: null,
      performance: perfValue,
      created_by: userId,
    } as never);

    if (error) {
      summary.errors++;
      if (summary.errors <= 5)
        summary.details.push(`❌ Error: ${error.message}`);
    } else {
      summary.inserted++;
    }
  }

  if (dryRun) summary.inserted = summary.found;

  return summary;
}

// ============================================================
// MAIN ROUTE
// ============================================================

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 2 imports/min per IP — very heavy operation
    const rateLimited = applyRateLimit(request, "import-dashboard-sheet", 2);
    if (rateLimited) return rateLimited;

    const auth = await getAuthenticatedUser(request);
    if (!auth.user || auth.error) return auth.error!;

    const body = await request.json();
    const sheetUrl: string = body.sheetUrl;
    const dryRun: boolean = body.dryRun || false;

    if (!sheetUrl || !sheetUrl.includes("docs.google.com")) {
      return NextResponse.json(
        { error: "URL Google Sheet tidak valid." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const spreadsheetBase = extractSpreadsheetBase(sheetUrl);

    if (!spreadsheetBase) {
      return NextResponse.json(
        { error: "Tidak dapat mengekstrak ID spreadsheet dari URL." },
        { status: 400 }
      );
    }

    // Step 1: Fetch the main published HTML to discover all sheets & their gids
    const baseUrl = `https://docs.google.com/spreadsheets/d/e/${spreadsheetBase}/pubhtml`;
    const htmlRes = await fetch(baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
    });

    if (!htmlRes.ok) {
      return NextResponse.json(
        { error: `Gagal fetch spreadsheet (HTTP ${htmlRes.status})` },
        { status: 502 }
      );
    }

    const html = await htmlRes.text();
    const sheetGids = extractSheetGids(html);

    if (sheetGids.length === 0) {
      return NextResponse.json(
        {
          error:
            "Tidak dapat menemukan sheet apapun. Pastikan spreadsheet sudah di-publish.",
        },
        { status: 400 }
      );
    }

    // Step 2: Fetch each sheet as CSV
    const csvUrls = sheetGids.map(
      (s) =>
        `https://docs.google.com/spreadsheets/d/e/${spreadsheetBase}/pub?output=csv&gid=${s.gid}`
    );

    const csvResponses = await Promise.all(
      csvUrls.map((url) =>
        fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
        }).then((r) => r.text())
      )
    );

    const csvData: Array<{ name: string; gid: string; csv: string }> =
      sheetGids.map((s, i) => ({
        name: s.name,
        gid: s.gid,
        csv: csvResponses[i],
      }));

    const allSummaries: ImportSummary[] = [];

    // Step 3: Import "Dashboard Client" → clients
    const dashboardClientCsv = csvData.find((c) =>
      c.name.toLowerCase().includes("dashboard")
    );

    let clientMap: ClientMap = {};

    if (dashboardClientCsv) {
      const { summary, clientMap: cMap } = await importDashboardClient(
        dashboardClientCsv.csv,
        supabase,
        dryRun
      );
      allSummaries.push(summary);
      clientMap = cMap;
    } else {
      // If no Dashboard Client sheet, still load existing clients
      const { data: existingClients } = await supabase
        .from("clients")
        .select("id, name");

      for (const c of existingClients as unknown as Array<{
        id: string;
        name: string;
      }>) {
        clientMap[normalizeClientName(c.name)] = c.id;
      }
    }

    // Step 4: Import task sheets
    const taskSheetMappings: Array<{
      namePattern: string;
      division: string;
    }> = [
      { namePattern: "content production", division: "Content Production" },
      { namePattern: "creative director", division: "Creative Director" },
      {
        namePattern: "social media manager",
        division: "Social Media Management",
      },
      { namePattern: "editor", division: "Editor" },
    ];

    for (const mapping of taskSheetMappings) {
      const csvItem = csvData.find((c) =>
        c.name.toLowerCase().includes(mapping.namePattern)
      );
      if (csvItem) {
        const taskSummary = await importTaskSheet(
          csvItem.csv,
          csvItem.name,
          mapping.division,
          clientMap,
          userId,
          supabase,
          dryRun
        );
        allSummaries.push(taskSummary);
      }
    }

    // Step 5: Import SMM Upload
    const smmUploadCsv = csvData.find((c) =>
      c.name.toLowerCase().includes("smm upload") ||
      c.name.toLowerCase().includes("upload")
    );
    if (smmUploadCsv) {
      const smmSummary = await importSmmUpload(
        smmUploadCsv.csv,
        clientMap,
        userId,
        supabase,
        dryRun
      );
      allSummaries.push(smmSummary);
    }

    // Step 6: Import Bank Caption Ads
    const captionCsv = csvData.find((c) =>
      c.name.toLowerCase().includes("caption") ||
      c.name.toLowerCase().includes("bank")
    );
    if (captionCsv) {
      const capSummary = await importCaptionBank(
        captionCsv.csv,
        clientMap,
        userId,
        supabase,
        dryRun
      );
      allSummaries.push(capSummary);
    }

    // Step 7: Compile final result
    const totalFound = allSummaries.reduce((a, s) => a + s.found, 0);
    const totalInserted = allSummaries.reduce((a, s) => a + s.inserted, 0);
    const totalErrors = allSummaries.reduce((a, s) => a + s.errors, 0);

    return NextResponse.json({
      success: true,
      dryRun,
      message: dryRun
        ? `Dry run: ${totalFound} records would be imported across ${allSummaries.length} sheets.`
        : `Import selesai! ${totalInserted} records berhasil dari ${totalFound} yang ditemukan.`,
      sheetsProcessed: allSummaries.length,
      totalFound,
      totalInserted,
      totalErrors,
      summaries: allSummaries,
    });
  } catch (err) {
    console.error("[Dashboard Sheet Import] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}