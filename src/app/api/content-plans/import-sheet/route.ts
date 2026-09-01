import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncTaskForPlan, type PlanTaskInfo } from "@/lib/content-plan-sync";

// ── Convert any Google Sheets URL to a CSV export URL ──────
function toCsvUrl(rawUrl: string): string | null {
  try {
    // Published-to-web CSV link already
    if (/output=csv/.test(rawUrl)) return rawUrl;
    // Published pubhtml link
    const pub = rawUrl.match(/spreadsheets\/d\/e\/([^/]+)\/pubhtml/);
    if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv`;
    // Normal edit link with gid
    const m = rawUrl.match(/spreadsheets\/d\/([^/]+)\/edit/);
    if (m) {
      const gid = rawUrl.match(/[?&]gid=(\d+)/)?.[1] || "0";
      return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Minimal CSV parser (handles quotes & commas/newlines inside quotes) ──
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n") {
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

// ── Header normalization (EN/ID variants) ─────────────────
const HEADER_MAP: Record<string, string> = {
  no: "no",
  "no.": "no",
  pillar: "pilar",
  pilar: "pilar",
  tipe: "konten",
  "tipe konten": "konten",
  konten: "konten",
  tema: "tema",
  copy: "copy",
  details: "details",
  detail: "details",
  referensi: "reference",
  reference: "reference",
  "link referensi": "reference",
  caption: "caption",
  thumbnail: "thumbnail",
  progress: "progress",
  "link hasil": "link_hasil",
  hasil: "link_hasil",
  "tanggal unggah": "tanggal_upload",
  "tanggal upload": "tanggal_upload",
  "tgl upload": "tanggal_upload",
  date: "tanggal_upload",
};

function normalizeHeader(h: string): string | null {
  const key = h.toLowerCase().trim().replace(/\s+/g, " ");
  return HEADER_MAP[key] || null;
}

// ── Value normalizers ─────────────────────────────────────
function normalizeProgress(v: string): string {
  const lower = v.toLowerCase().trim();
  if (["done", "selesai", "wrapped", "terpublish", "published"].includes(lower)) return "done";
  if (["cancel", "cancelled", "canceled", "dibatalkan"].includes(lower)) return "cancel";
  return "proses_edit";
}

// Direct month lookup (ID + EN aliases). Previously used indexOf() % 12 on a
// 15-entry alias array, which silently corrupted Okt→Sep, Nov→Jan, Des→Feb.
const MONTH_MAP: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", may: "05", jun: "06",
  jul: "07", agu: "08", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", des: "12", dec: "12",
};

function normalizeDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  // ISO already
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // "12 Agu 2025" (Indonesian) / "12 Aug 2025" (English)
  const words = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (words) {
    const monthNum = MONTH_MAP[words[2].toLowerCase().slice(0, 3)];
    if (monthNum) {
      return `${words[3]}-${monthNum}-${words[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function normalizeUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

// ── Extract rows from CSV grid ─────────────────────────────
function extractRows(grid: string[][]): Record<string, string>[] {
  if (grid.length < 2) return [];
  // Find header row: first row containing at least 2 known headers
  let headerIdx = -1;
  let colMap: Record<number, string> = {};
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const map: Record<number, string> = {};
    grid[i].forEach((h, idx) => {
      const norm = normalizeHeader(h);
      if (norm && !(norm === "no" && Object.values(map).includes("no"))) map[idx] = norm;
    });
    if (Object.keys(map).length >= 2) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const out: Record<string, string>[] = [];
  let no = 0;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    const obj: Record<string, string> = {};
    Object.entries(colMap).forEach(([idx, field]) => {
      obj[field] = row[Number(idx)] || "";
    });
    // Skip fully empty rows
    if (!Object.values(obj).some((v) => v)) continue;
    no++;
    obj.no = obj.no || String(no);
    out.push(obj);
  }
  return out;
}

// ── POST handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Auth guard — konsisten dengan route import lain (import/sheet, reports/import-sheet,
    // import/dashboard-sheet). Middleware /api/* hanya enforce CSRF, bukan auth: RLS masih
    // melindungi insert, tapi previewOnly akan membocorkan isi sheet ke user belum login.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const url: string = body.url || "";
    const previewOnly: boolean = !!body.previewOnly;
    const clientId: string = body.clientId || "";
    const month: string = body.month || "";

    const csvUrl = toCsvUrl(url);
    if (!csvUrl) {
      return NextResponse.json(
        { error: "URL bukan Google Sheet yang valid. Gunakan link docs.google.com/spreadsheets" },
        { status: 400 }
      );
    }

    const res = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Gagal mengambil sheet (HTTP ${res.status}). Pastikan sheet di-share "Anyone with the link" atau Publish to web.` },
        { status: 400 }
      );
    }
    const csv = await res.text();
    if (csv.trim().startsWith("<")) {
      return NextResponse.json(
        { error: "Sheet belum published/di-share publik. Publish to web dulu (File → Share → Publish to web)." },
        { status: 400 }
      );
    }

    const grid = parseCsv(csv);
    const rawRows = extractRows(grid);

    const rows = rawRows.map((r, i) => ({
      no: Number(r.no) || i + 1,
      pilar: r.pilar || "",
      konten: r.konten || "",
      tema: r.tema || "",
      copy: r.copy || "",
      details: r.details || "",
      reference: r.reference || "",
      caption: r.caption || "",
      thumbnail: r.thumbnail || "",
      link_hasil: r.link_hasil || "",
      tanggal_upload: r.tanggal_upload || "",
      progress: r.progress || "",
    }));

    // Detect client name from sheet title row (first row often has client name)
    let detectedClient = "";
    for (const rowCells of grid.slice(0, Math.min(3, grid.length))) {
      const joined = rowCells.join(" ").toLowerCase();
      for (const name of ["tpdoc", "shumi", "threenine", "hadona"]) {
        if (joined.includes(name)) detectedClient = name;
      }
    }

    if (previewOnly) {
      return NextResponse.json({ rows, detectedClient });
    }

    // ── Actual import ──
    if (!clientId || !month) {
      return NextResponse.json({ error: "clientId dan month wajib diisi" }, { status: 400 });
    }

    const importStart = new Date();
    const inserts = rows
      .filter((r) => r.pilar || r.tema || r.copy || r.caption || r.details)
      .map((r, i) => ({
        client_id: clientId,
        month,
        pilar: r.pilar || null,
        konten: r.konten || null,
        tema: r.tema || null,
        copy: r.copy || null,
        details: r.details || null,
        reference: normalizeUrl(r.reference),
        caption: r.caption || null,
        thumbnail: r.thumbnail || null,
        link_hasil: normalizeUrl(r.link_hasil),
        tanggal_upload: normalizeDate(r.tanggal_upload),
        progress: normalizeProgress(r.progress),
        status: "active",
        services: [],
        // Urutan baris permanen sesuai sheet: sort_order = index baris (v100).
        // Loop fallback di bawah otomatis strip sort_order bila kolom belum ada
        // (pre-migration) — urutan tetap aman via created_at sekuensial.
        sort_order: i,
        created_at: new Date(Date.now() - i * 60_000).toISOString(),
      }));

    if (inserts.length === 0) {
      return NextResponse.json({ error: "Tidak ada baris valid untuk diimport" }, { status: 400 });
    }

    // Fallback: strip columns that don't exist yet in DB (pre-migration-v88)
    let current = inserts;
    const skippedCols = new Set<string>();
    let insertError: { message: string } | null = null;
    for (let i = 0; i <= 5; i++) {
      const res = await supabase.from("content_plans").insert(current as never);
      if (!res.error) { insertError = null; break; }
      insertError = res.error;
      const m = res.error.message.match(/Could not find the '([^']+)' column/);
      if (m && current.some((r) => m[1] in r)) {
        skippedCols.add(m[1]);
        current = current.map((r) => {
          const c: Record<string, unknown> = { ...r };
          delete c[m[1]];
          return c as (typeof inserts)[number];
        });
        continue;
      }
      break;
    }
    if (insertError) {
      return NextResponse.json({ error: "Gagal insert ke database: " + insertError.message }, { status: 500 });
    }
    const warn =
      skippedCols.size > 0
        ? ` Kolom [${Array.from(skippedCols).join(", ")}] dilewati — jalankan migration terkini (v88+ / v100, lihat supabase/MIGRATIONS.md) di Supabase SQL Editor.`
        : "";

    // ── Workflow sync: baris "Proses Edit" → task Editor di Task Manager ──
    // Idempoten: syncTaskForPlan cek duplikat via tasks.sheet_row_id sebelum insert.
    // Failure non-blocking: import tetap sukses walau pembuatan task gagal.
    let tasksCreated = 0;
    try {
      const { data: freshPlans, error: qErr } = await supabase
        .from("content_plans")
        .select("id, client_id, pilar, konten, tema, details, reference, tanggal_upload, progress, client:clients(name)")
        .eq("client_id", clientId)
        .eq("month", month)
        .gte("created_at", importStart.toISOString())
        .eq("progress", "proses_edit");
      if (qErr) throw new Error(qErr.message);
      for (const plan of (freshPlans as unknown as (PlanTaskInfo & { progress: string })[]) || []) {
        const res = await syncTaskForPlan(supabase, plan, "proses_edit");
        if (res.action === "created") tasksCreated++;
      }
    } catch (syncErr) {
      const msg = syncErr instanceof Error ? syncErr.message : "Unknown error";
      console.error("[content-plan-import] Sync task editor gagal:", msg);
    }

    return NextResponse.json({ count: current.length, rows: current.length, tasksCreated, warning: warn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}