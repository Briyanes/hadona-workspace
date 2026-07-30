import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/import/sheet
 * Imports ad account names from a published Google Sheet.
 *
 * The sheet has ad account names in a column (e.g. column E).
 * Each name follows a pattern like "WL Arum 1529", "WL Hadona 0567", etc.
 *
 * Body params:
 * - sheetUrl: The published Google Sheet URL (pubhtml format)
 * - column: Which column letter to extract (default: "E")
 * - platform: "META" | "Google" | "TikTok" (default: "META")
 * - clientId: Optional client_id to link all imported accounts to
 */

interface SheetAdAccount {
  name: string;
  platform: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sheetUrl: string = body.sheetUrl;
    const columnLetter: string = (body.column || "E").toUpperCase();
    const platform: string = body.platform || "META";
    const clientId: string | null = body.clientId || null;

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

    console.log(`[Sheet Import] Fetching: ${sheetUrl}`);
    console.log(`[Sheet Import] Target column: ${columnLetter}, Platform: ${platform}`);

    // Fetch the published HTML
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

    // Parse HTML table to extract ad account names from target column
    const adAccounts = parseSheetHtml(html, columnLetter, platform);

    console.log(`[Sheet Import] Found ${adAccounts.length} ad account names`);

    if (adAccounts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Tidak ada ad account ditemukan di sheet",
        imported: 0,
      });
    }

    // Upsert each ad account into the database
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const details: Array<{ name: string; action: string }> = [];

    for (const acc of adAccounts) {
      try {
        // Check if account already exists by name + platform
        const { data: existingRaw } = await supabase
          .from("ad_accounts")
          .select("id, ad_account_id, account_name, platform")
          .eq("account_name", acc.name)
          .eq("platform", acc.platform)
          .maybeSingle();

        const existing = existingRaw as unknown as {
          id: string;
          ad_account_id: string;
          account_name: string | null;
          platform: string;
        } | null;

        if (existing) {
          // Already exists - update client_id if provided
          if (clientId && existing.ad_account_id) {
            await supabase
              .from("ad_accounts")
              .update({ client_id: clientId } as never)
              .eq("id", existing.id);
            updated++;
            details.push({ name: acc.name, action: "updated" });
          } else {
            skipped++;
            details.push({ name: acc.name, action: "exists" });
          }
        } else {
          // Create new record
          await supabase.from("ad_accounts").insert({
            account_name: acc.name,
            platform: acc.platform,
            ad_account_id: `PENDING_MATCH_${Date.now()}_${imported}`,
            client_id: clientId,
            status: "active",
          } as never);
          imported++;
          details.push({ name: acc.name, action: "created" });
        }
      } catch (e) {
        console.error(`[Sheet Import] Error for "${acc.name}":`, e);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import selesai! ${imported} baru, ${updated} diupdate, ${skipped} sudah ada.`,
      total_found: adAccounts.length,
      imported,
      updated,
      skipped,
      details: details.slice(0, 50), // Limit details to avoid huge response
    });
  } catch (err) {
    console.error("[Sheet Import] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Parse published Google Sheet HTML to extract values from a specific column.
 * Published sheets use <table> with <td> cells.
 */
function parseSheetHtml(html: string, columnLetter: string, platform: string): SheetAdAccount[] {
  const accounts: SheetAdAccount[] = [];
  const seen = new Set<string>();

  // Convert column letter to index (A=0, B=1, C=2, D=3, E=4, etc.)
  const colIndex = columnLetter.charCodeAt(0) - 65;

  // Extract all table rows
  // Published Google Sheets use <tr> with <td> cells
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract all cells (td) from this row
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Clean HTML tags and whitespace from cell content
      const content = cellMatch[1]
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();

      cells.push(content);
    }

    // Get the value from target column
    if (cells.length > colIndex) {
      const value = cells[colIndex];

      // Filter: skip empty, headers, and non-ad-account values
      if (!value || value.length < 3) continue;

      // Skip header rows (usually contain words like "Account", "Name", "Client", etc.)
      const lowerValue = value.toLowerCase();
      if (
        lowerValue === "account" ||
        lowerValue === "name" ||
        lowerValue === "client" ||
        lowerValue === "ad account" ||
        lowerValue === "platform" ||
        lowerValue.includes("total") ||
        lowerValue.includes("grand") ||
        lowerValue.match(/^\d+$/) // Pure numbers (likely row numbers or IDs)
      ) {
        continue;
      }

      // Must look like an ad account name (alphanumeric with spaces)
      if (!value.match(/^[A-Za-z0-9\s\-_]+$/)) continue;

      // Deduplicate
      if (seen.has(value)) continue;
      seen.add(value);

      accounts.push({ name: value, platform });
    }
  }

  return accounts;
}