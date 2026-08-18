import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-api";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/import/strategy-sheet
 * Import published Google Sheet → Client Strategy Canvas tables (migration-v87).
 *
 * Body:
 *   - sheetUrl: Published Google Sheet URL (pubhtml or pub?format=...)
 *   - dryRun?: boolean — validate only, no writes
 *
 * Recognized tabs (name matched case-insensitively, partial):
 *   - "sosmed" / "social"        → client_social_accounts
 *   - "kompetitor" / "competitor" → client_competitors
 *   - "4m" / "principle"          → client_principles
 *   - "initiative" / "strategy"   → client_initiatives
 *   - "okr"                       → okrs (client_id set)
 *
 * Each tab must contain a "Client" column matching a client name (exact or partial).
 * Import is REPLACE-per-client: existing rows for that client in the target table are deleted first.
 */

interface ImportSummary {
  sheet: string;
  imported: number;
  skipped: number;
  error?: string;
}

type ClientMap = Record<string, string>; // normalized name → client UUID

// ---------- helpers ----------

function extractSpreadsheetBase(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m2 ? m2[1] : null;
}

function extractSheetGids(html: string): Array<{ name: string; gid: string }> {
  const sheets: Array<{ name: string; gid: string }> = [];
  const seen = new Set<string>();

  const re1 = /"gid":"(\d+)","sheetName":"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re1.exec(html)) !== null) {
    const gid = match[1];
    const name = match[2].trim();
    if (!seen.has(gid)) {
      seen.add(gid);
      sheets.push({ name, gid });
    }
  }

  if (sheets.length === 0) {
    const re2 = /<a[^>]*gid=(\d+)[^>]*>([^<]+)<\/a>/gi;
    while ((match = re2.exec(html)) !== null) {
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

/** Minimal CSV parser with quote support. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function findClientId(rawName: string, clientMap: ClientMap): string | null {
  const normalized = normalizeClientName(rawName);
  if (!normalized) return null;
  if (clientMap[normalized]) return clientMap[normalized];
  // Partial match
  for (const [key, id] of Object.entries(clientMap)) {
    if (key.includes(normalized) || normalized.includes(key)) return id;
  }
  return null;
}

function toRows(csv: string): Array<Record<string, string>> {
  const grid = parseCsv(csv);
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  return grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || "").trim(); });
    return obj;
  });
}

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const cleaned = v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

const intNum = (v: string | undefined): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

function normalizePlatform(v: string): string {
  const p = v.toLowerCase().trim();
  if (p.includes("ig") || p.includes("insta")) return "instagram";
  if (p.includes("tt") || p.includes("tik")) return "tiktok";
  if (p.includes("fb") || p.includes("face")) return "facebook";
  if (p.includes("yt") || p.includes("tube")) return "youtube";
  if (p.includes("wa") || p.includes("whats")) return "whatsapp";
  if (p.includes("x") || p.includes("twitter")) return "x";
  return p || "unknown";
}

function normalizeCategory(v: string): "mindset" | "manpower" | "tools" | "budget" {
  const c = v.toLowerCase();
  if (c.includes("man")) return "manpower";
  if (c.includes("tool") || c.includes("material")) return "tools";
  if (c.includes("budget") || c.includes("dana") || c.includes("uang")) return "budget";
  return "mindset";
}

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h.includes(k));
    if (hit && row[hit]) return row[hit];
  }
  return undefined;
}

// ---------- main ----------

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user || auth.error) return auth.error!;

  const body = await request.json();
  const sheetUrl: string = body.sheetUrl;
  const dryRun: boolean = body.dryRun || false;

  if (!sheetUrl || !sheetUrl.includes("docs.google.com")) {
    return NextResponse.json({ error: "URL Google Sheet tidak valid." }, { status: 400 });
  }

  const supabase = createClient();
  const spreadsheetBase = extractSpreadsheetBase(sheetUrl);
  if (!spreadsheetBase) {
    return NextResponse.json({ error: "Tidak dapat mengekstrak ID spreadsheet dari URL." }, { status: 400 });
  }

  // Discover tabs
  const htmlRes = await fetch(
    `https://docs.google.com/spreadsheets/d/e/${spreadsheetBase}/pubhtml`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } }
  );
  if (!htmlRes.ok) {
    return NextResponse.json({ error: `Gagal fetch spreadsheet (HTTP ${htmlRes.status})` }, { status: 502 });
  }
  const gids = extractSheetGids(await htmlRes.text());
  if (gids.length === 0) {
    return NextResponse.json({ error: "Tidak dapat menemukan sheet apapun. Pastikan spreadsheet sudah di-publish." }, { status: 400 });
  }

  // Fetch CSVs in parallel
  const csvs = await Promise.all(
    gids.map((g) =>
      fetch(
        `https://docs.google.com/spreadsheets/d/e/${spreadsheetBase}/pub?output=csv&gid=${g.gid}`,
        { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } }
      ).then((r) => r.text())
    )
  );

  // Build client map
  const { data: clientsData } = await supabase.from("clients").select("id, name");
  const clientMap: ClientMap = {};
  for (const c of (clientsData || []) as unknown as Array<{ id: string; name: string }>) {
    clientMap[normalizeClientName(c.name)] = c.id;
  }

  const summaries: ImportSummary[] = [];

  async function importTab(
    label: string,
    csv: string,
    write: (clientId: string, rows: Array<Record<string, string>>) => Promise<{ imported: number; skipped: number }>
  ) {
    try {
      const rows = toRows(csv);
      if (rows.length === 0) {
        summaries.push({ sheet: label, imported: 0, skipped: 0 });
        return;
      }
      const byClient = new Map<string, Array<Record<string, string>>>();
      let skipped = 0;
      for (const row of rows) {
        const clientName = pick(row, "client", "brand", "klien");
        const clientId = clientName ? findClientId(clientName, clientMap) : null;
        if (!clientId) { skipped++; continue; }
        if (!byClient.has(clientId)) byClient.set(clientId, []);
        byClient.get(clientId)!.push(row);
      }
      if (dryRun) {
        let total = 0;
        byClient.forEach((r) => { total += r.length; });
        summaries.push({ sheet: label, imported: total, skipped });
        return;
      }
      let imported = 0;
      for (const clientId of Array.from(byClient.keys())) {
        const res = await write(clientId, byClient.get(clientId)!);
        imported += res.imported;
      }
      summaries.push({ sheet: label, imported, skipped });
    } catch (err) {
      summaries.push({ sheet: label, imported: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- Sosmed ---
  const sosmedCsv = csvs[gids.findIndex((g) => /sosmed|social/i.test(g.name))];
  if (sosmedCsv !== undefined) {
    await importTab("Sosmed", sosmedCsv, async (clientId, rows) => {
      await supabase.from("client_social_accounts").delete().eq("client_id", clientId);
      let imported = 0;
      for (const r of rows) {
        const platform = normalizePlatform(pick(r, "platform", "sosmed", "akun") || "instagram");
        const payload = {
          client_id: clientId,
          platform,
          handle: pick(r, "handle", "username", "akun") || null,
          url: pick(r, "url", "link") || null,
          followers: intNum(pick(r, "follower", "followers")) || 0,
          ads_connected: /ya|yes|true|✓|1/i.test(pick(r, "ads", "advert") || ""),
          notes: pick(r, "note", "catatan", "keterangan") || null,
        };
        const { error } = await supabase.from("client_social_accounts").upsert(payload as never, { onConflict: "client_id,platform" });
        if (error) throw error;
        imported++;
      }
      return { imported, skipped: 0 };
    });
  }

  // --- Kompetitor ---
  const compIdx = csvs ? gids.findIndex((g) => /kompetitor|competitor|benchmark/i.test(g.name)) : -1;
  if (compIdx >= 0) {
    await importTab("Kompetitor", csvs[compIdx], async (clientId, rows) => {
      await supabase.from("client_competitors").delete().eq("client_id", clientId);
      let imported = 0;
      for (const r of rows) {
        const name = pick(r, "kompetitor", "competitor", "name", "nama");
        if (!name) continue;
        const { error } = await supabase.from("client_competitors").insert({
          client_id: clientId,
          name,
          platform: normalizePlatform(pick(r, "platform") || "instagram"),
          handle: pick(r, "handle", "username") || null,
          followers: intNum(pick(r, "follower")) || 0,
          engagement_rate: num(pick(r, "engagement", "er")),
          posting_freq: pick(r, "freq", "posting", "frekuensi") || null,
          positioning: pick(r, "positioning", "kekuatan", "strength") || null,
          weakness: pick(r, "weakness", "kelemahan", "gap") || null,
        } as never);
        if (error) throw error;
        imported++;
      }
      return { imported, skipped: 0 };
    });
  }

  // --- 4M Principles ---
  const pIdx = gids.findIndex((g) => /4m|principle|prinsip/i.test(g.name));
  if (pIdx >= 0) {
    await importTab("Principles 4M", csvs[pIdx], async (clientId, rows) => {
      await supabase.from("client_principles").delete().eq("client_id", clientId);
      let imported = 0;
      let order = 0;
      for (const r of rows) {
        const desc = pick(r, "description", "deskripsi", "isi", "principle", "prinsip");
        if (!desc) continue;
        const { error } = await supabase.from("client_principles").insert({
          client_id: clientId,
          category: normalizeCategory(pick(r, "category", "kategori", "m") || "mindset"),
          description: desc,
          sort_order: order++,
        } as never);
        if (error) throw error;
        imported++;
      }
      return { imported, skipped: 0 };
    });
  }

  // --- Initiatives ---
  const iIdx = gids.findIndex((g) => /initiative|inisiatif|strategy|strategi/i.test(g.name));
  if (iIdx >= 0) {
    await importTab("Initiatives", csvs[iIdx], async (clientId, rows) => {
      await supabase.from("client_initiatives").delete().eq("client_id", clientId);
      let imported = 0;
      let order = 0;
      for (const r of rows) {
        const desc = pick(r, "initiative", "inisiatif", "description", "deskripsi", "strategy", "strategi");
        if (!desc || /^(description|deskripsi|initiative|inisiatif|strategy|strategi|no|tag|tipe|type)$/i.test(desc.trim())) continue;
        const rawTag = (pick(r, "tag", "tipe", "type") || "ADS").toUpperCase();
        const { error } = await supabase.from("client_initiatives").insert({
          client_id: clientId,
          description: desc,
          tag: rawTag.includes("SM") ? "SM" : "ADS",
          status: "planned",
          sort_order: order++,
        } as never);
        if (error) throw error;
        imported++;
      }
      return { imported, skipped: 0 };
    });
  }

  // --- OKR ---
  const oIdx = gids.findIndex((g) => /^okr|okr/i.test(g.name));
  if (oIdx >= 0) {
    await importTab("OKR", csvs[oIdx], async (clientId, rows) => {
      await supabase.from("okrs").delete().eq("client_id", clientId);
      let imported = 0;
      const now = new Date();
      const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;
      const year = now.getFullYear();
      for (const r of rows) {
        const objective = pick(r, "objective", "objektif", "tujuan");
        if (!objective) continue;
        const target = num(pick(r, "target"));
        const baseline = num(pick(r, "baseline", "base"));
        const payload = {
          client_id: clientId,
          objective,
          key_result: pick(r, "key_result", "key result", "kr") || null,
          quarter: pick(r, "quarter", "q") || quarter,
          year: intNum(pick(r, "year", "tahun")) || year,
          target_value: target,
          baseline_value: baseline ?? 0,
          actual_value: num(pick(r, "actual")) ?? 0,
          unit: pick(r, "unit", "satuan") || null,
          metric_name: pick(r, "metric", "metrik") || null,
          kr_type: /lead/i.test(pick(r, "type", "tipe") || "") ? "leading" : "lagging",
          progress_pct: 0,
          status: "behind",
        };
        const { error } = await supabase.from("okrs").insert(payload as never);
        if (error) throw error;
        imported++;
      }
      return { imported, skipped: 0 };
    });
  }

  const matched = summaries.filter((s) => s.imported > 0).length;
  if (matched === 0) {
    return NextResponse.json(
      { error: "Tidak ada tab strategy yang dikenali (cari tab: Sosmed / Kompetitor / 4M / Initiatives / OKR).", summaries },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, dryRun, summaries });
}
