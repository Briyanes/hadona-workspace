import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/import/assign-from-sheet
 *
 * Smart Auto-Assign: Reads a published Google Sheet with Client names (col B)
 * and Nomor Akun / Account identifiers (col F), then automatically:
 *   1. Creates missing clients
 *   2. Matches ad_accounts via fuzzy/ID matching
 *   3. Bulk-updates client_id
 *
 * Body params:
 *   - sheetUrl:      Published Google Sheet URL (pubhtml)
 *   - clientColumn:  Column letter for Client name (default: "B")
 *   - accountColumn: Column letter for Nomor Akun (default: "F")
 */

interface DbAdAccount {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  client_id: string | null;
  platform: string;
}

interface DbClient {
  id: string;
  name: string;
}

// ─── Helpers ────────────────────────────────────────────────

/** Normalize a string for comparison (lowercase, collapse spaces, strip FB IDs in parens). */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\((\d{10,})\)/g, "") // remove "(123456789012)"
    .replace(/[()[\]]/g, "")
    .trim();
}

/** Extract a Facebook numeric ID (10+ digits) from parentheses, e.g. "(1704028176749181)". */
function extractFbId(text: string): string | null {
  const m = text.match(/\((\d{10,})\)/);
  return m ? m[1] : null;
}

/** Extract core identifier pattern like "WL Arum 1529", "Meta Hadona 0003", "WL Hadona 0567". */
function extractCorePattern(text: string): string | null {
  const m = text.match(/(WL\s+\w+\s+\d+|Meta\s+Hadona\s+\d+|WL\s+Hadona\s+\d+)/i);
  return m ? m[1].trim() : null;
}

/** Values that are NOT real ad account names — should be skipped. */
function isSkipValue(v: string): boolean {
  const lower = v.toLowerCase().trim();
  if (!lower || lower.length < 3) return true;
  const skipList = [
    "bm lama",
    "bm milik client",
    "bm milik klien",
    "bm baru",
    "total",
    "grand total",
    "-",
    "n/a",
    "kosong",
  ];
  return skipList.includes(lower);
}

/**
 * Find the best-matching ad account for a given sheet "Nomor Akun" value.
 * Matching priority:
 *   1. Exact normalized account_name match
 *   2. Facebook numeric ID match (ad_account_id)
 *   3. account_name starts-with / contains
 *   4. Core pattern (e.g. "WL Arum 1529") substring match
 */
function findMatchingAccount(
  nomorAkun: string,
  accounts: DbAdAccount[]
): DbAdAccount | null {
  const normalizedSheet = normalize(nomorAkun);
  const fbId = extractFbId(nomorAkun);
  const core = extractCorePattern(nomorAkun);

  // Strategy 1: Exact normalized match
  let match = accounts.find(
    (a) => a.account_name && normalize(a.account_name) === normalizedSheet
  );
  if (match) return match;

  // Strategy 2: FB ID match (most reliable)
  if (fbId) {
    match = accounts.find((a) => a.ad_account_id === fbId);
    if (match) return match;
  }

  // Strategy 3: Starts-with / contains (bidirectional)
  match = accounts.find((a) => {
    if (!a.account_name) return false;
    const dbNorm = normalize(a.account_name);
    if (dbNorm.length < 3 || normalizedSheet.length < 3) return false;
    return dbNorm.startsWith(normalizedSheet) || normalizedSheet.startsWith(dbNorm);
  });
  if (match) return match;

  // Strategy 4: Core pattern match
  if (core) {
    const coreNorm = core.toLowerCase().trim();
    match = accounts.find((a) => {
      if (!a.account_name) return false;
      return a.account_name.toLowerCase().includes(coreNorm);
    });
    if (match) return match;
  }

  return null;
}

// ─── Sheet Parser ───────────────────────────────────────────

/** Parse published Google Sheet HTML into rows of cell values. */
function parseSheetRows(html: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const content = cellMatch[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();
      cells.push(content);
    }

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

// ─── Main Endpoint ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sheetUrl: string = body.sheetUrl;
    const clientCol: string = (body.clientColumn || "B").toUpperCase();
    const accountCol: string = (body.accountColumn || "F").toUpperCase();

    if (!sheetUrl || !sheetUrl.includes("docs.google.com")) {
      return NextResponse.json(
        { error: "URL Google Sheet tidak valid. Pastikan format pubhtml." },
        { status: 400 }
      );
    }

    // Verify user session
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    // Fetch published HTML
    const res = await fetch(sheetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Gagal fetch sheet (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const rows = parseSheetRows(html);


    // Convert column letters to indices
    const clientIdx = clientCol.charCodeAt(0) - 65;
    const accountIdx = accountCol.charCodeAt(0) - 65;

    // Extract valid (client, nomorAkun) pairs
    const pairs: Array<{ client: string; nomorAkun: string }> = [];
    for (const cells of rows) {
      if (cells.length <= Math.max(clientIdx, accountIdx)) continue;

      const client = cells[clientIdx]?.trim() || "";
      const nomorAkun = cells[accountIdx]?.trim() || "";

      // Skip header rows
      const lowerClient = client.toLowerCase();
      if (
        lowerClient === "client" ||
        lowerClient === "nama client" ||
        lowerClient === "nama klien"
      )
        continue;

      // Skip rows without both values
      if (!client || !nomorAkun) continue;
      if (client.length < 2) continue;
      if (isSkipValue(nomorAkun)) continue;

      // Skip pure numbers (row numbers)
      if (/^\d+$/.test(client)) continue;

      pairs.push({ client, nomorAkun });
    }


    if (pairs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tidak ada data valid ditemukan di sheet.",
        matched: 0,
        created: 0,
        skipped: 0,
      });
    }

    // Load all existing clients from DB
    const { data: clientsRaw } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    const clients: DbClient[] = (clientsRaw as unknown as DbClient[]) || [];

    // Build a lookup map (normalized name → client)
    const clientMap = new Map<string, DbClient>();
    for (const c of clients) {
      clientMap.set(normalize(c.name), c);
    }

    // Load all ad_accounts (including assigned, for matching)
    const { data: accountsRaw } = await supabase
      .from("ad_accounts")
      .select("id, ad_account_id, account_name, client_id, platform");
    const allAccounts: DbAdAccount[] = (accountsRaw as unknown as DbAdAccount[]) || [];

    // Unassigned accounts (for matching priority)
    const unassigned = allAccounts.filter((a) => !a.client_id);

    // ─── Process each pair ──────────────────────────────────
    let matched = 0;
    let createdClients = 0;
    let alreadyAssigned = 0;
    let noMatch = 0;
    let duplicates = 0;

    const matchedDetails: Array<{
      client: string;
      nomorAkun: string;
      accountName: string | null;
      action: "matched" | "already_assigned" | "client_created";
    }> = [];

    const noMatchDetails: Array<{ client: string; nomorAkun: string }> = [];

    // Track which accounts we've already assigned in this run (avoid double-assign)
    const assignedInRun = new Set<string>();

    for (const { client, nomorAkun } of pairs) {
      // 1. Get or create client
      let dbClient = clientMap.get(normalize(client));

      if (!dbClient) {
        // Create new client
        const { data: newClientRaw, error: createErr } = await supabase
          .from("clients")
          .insert({ name: client } as never)
          .select("id, name")
          .single();

        if (createErr || !newClientRaw) {
          console.error(`[Auto-Assign] Failed to create client "${client}":`, createErr);
          noMatch++;
          noMatchDetails.push({ client, nomorAkun });
          continue;
        }

        dbClient = newClientRaw as unknown as DbClient;
        clientMap.set(normalize(client), dbClient);
        createdClients++;
      }

      // 2. Find matching ad account
      // Priority: search unassigned first, then all (in case already assigned)
      let account = findMatchingAccount(nomorAkun, unassigned);

      // If not found in unassigned, try all accounts
      if (!account) {
        account = findMatchingAccount(nomorAkun, allAccounts);
      }

      if (!account) {
        noMatch++;
        noMatchDetails.push({ client, nomorAkun });
        continue;
      }

      // Skip if already assigned in this run
      if (assignedInRun.has(account.id)) {
        duplicates++;
        continue;
      }

      // Skip if already assigned to same client
      if (account.client_id === dbClient.id) {
        alreadyAssigned++;
        continue;
      }

      // 3. Update client_id
      const { error: updateErr } = await supabase
        .from("ad_accounts")
        .update({ client_id: dbClient.id } as never)
        .eq("id", account.id);

      if (updateErr) {
        console.error(`[Auto-Assign] Failed to update account ${account.id}:`, updateErr);
        noMatch++;
        noMatchDetails.push({ client, nomorAkun });
        continue;
      }

      assignedInRun.add(account.id);
      matched++;
      matchedDetails.push({
        client: dbClient.name,
        nomorAkun,
        accountName: account.account_name,
        action: createdClients > 0 && dbClient.name === client ? "client_created" : "matched",
      });
    }

    // Build summary message
    const parts: string[] = [];
    parts.push(`${matched} akun di-assign`);
    if (createdClients > 0) parts.push(`${createdClients} client baru dibuat`);
    if (alreadyAssigned > 0) parts.push(`${alreadyAssigned} sudah sesuai`);
    if (duplicates > 0) parts.push(`${duplicates} duplikat dilewati`);
    if (noMatch > 0) parts.push(`${noMatch} tidak match`);


    return NextResponse.json({
      success: true,
      message: `Auto-assign selesai! ${parts.join(" • ")}`,
      total_pairs: pairs.length,
      matched,
      clients_created: createdClients,
      already_assigned: alreadyAssigned,
      duplicates,
      no_match: noMatch,
      matched_details: matchedDetails.slice(0, 100),
      no_match_details: noMatchDetails.slice(0, 50),
    });
  } catch (err) {
    console.error("[Auto-Assign] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}