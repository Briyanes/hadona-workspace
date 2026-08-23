/**
 * ============================================================================
 * RESOLVE CONTENT LINK → URL (VERSI SMART / v2 — Shared Drive + fuzzy match)
 * ============================================================================
 * Kelemahan v1 (resolveContentLinksFromDrive) yang diperbaiki v2:
 *  1. DriveApp.getFilesByName() TIDAK bisa menemukan file di Shared Drive
 *     (Team Drive) — padahal aset klien sering disimpan di sana.
 *  2. Nama harus PERSIS sama — "Brief 5" tidak ketemu kalau file bernama
 *     "Brief5.mp4" (beda spasi / ekstensi / huruf besar-kecil).
 *
 * Script v2 ini:
 *  1. Pakai Advanced Drive Service (Drive API v2) dengan
 *     supportsAllDrives + includeItemsFromAllDrives + corpora=allDrives
 *     → BISA menemukan file di Shared Drive.
 *     (Kalau service belum diaktifkan → otomatis fallback ke DriveApp,
 *       perilaku sama seperti v1, dan dicatat di log.)
 *  2. Fuzzy match aman, 3 level:
 *       exact : nama file PERSIS sama dengan teks cell
 *       norm  : sama setelah normalisasi — abaikan huruf besar/kecil, spasi,
 *               tanda baca, dan ekstensi file.
 *               Contoh: "Brief 5" ≈ "Brief5.mp4" ≈ "brief_5"
 *       fuzzy : nama file (hasil normalisasi) MULAI dengan teks cell.
 *               Contoh: "Brief5" cocok dengan "Brief5 Final.mp4"
 *  3. Tetap non-destruktif + aturan aman (sama seperti v1):
 *       - Baris yang kolom (URL)-nya sudah terisi → dilewati (tidak ditimpa)
 *       - Tepat 1 file unik → auto-fill:
 *           exact      → HIJAU muda
 *           norm/fuzzy → KUNING muda + note "mohon cek sebentar"
 *       - 0 file atau >1 file → cell KUNING + note "CEK MANUAL"
 *
 * ============================================================================
 * CARA PAKAI (di SHEET ASLI — bukan link publish):
 * ============================================================================
 * 1. Buka spreadsheet Google Sheets ASLI → Extensions → Apps Script.
 * 2. PENTING — aktifkan Advanced Drive Service (sekali saja):
 *       Di sidebar kiri editor, cari bagian "Services" → klik ➕ →
 *       pilih "Drive API" → identifier "Drive" (default) → Add.
 *    (Tanpa langkah ini script tetap jalan, tapi fallback ke DriveApp =
 *     tidak bisa lihat Shared Drive — sama seperti v1.)
 * 3. Tambahkan file script baru (＋ di samping Files) → paste SEMUA kode ini.
 *    (Boleh satu project dengan script extractNotesToColumns & v1.)
 * 4. Save 💾 → pilih fungsi `resolveContentLinksSmart` → Run ▶.
 * 5. Permission pertama kali: "Review permissions" → pilih akun →
 *    "Advanced" → "Go to ... (unsafe)" → Allow.
 *    (Scope Drive diperlukan untuk mencari file di semua Drive.)
 * 6. Tunggu log "SELESAI". Cek sheet "Link Resolution Log" untuk ringkasan
 *    per baris: AUTO / AUTO MIRIP / REVIEW.
 * 7. Cell KUNING di kolom (URL) = ambigu → tim isi manual URL-nya.
 * 8. File → Share → Publish to web → **Publish ulang** (re-publish).
 * 9. Jalankan: node scripts/import-ads-creative-master.mjs
 *10. Verifikasi: node scripts/audit-ads-creative-completeness.mjs
 *
 * CATATAN:
 * - Idempotent: hanya memproses baris yang kolom (URL)-nya masih kosong,
 *   jadi aman dijalankan berulang setelah tim menambah konten baru.
 * - Jalankan dari akun Google yang punya akses ke folder aset klien.
 * ============================================================================
 */

function resolveContentLinksSmart() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  // Kandidat ekstensi untuk fallback DriveApp (nama generik tanpa ekstensi)
  const EXT_CANDIDATES = [".mp4", ".mov", ".jpg", ".jpeg", ".png", ".webp"];

  // Cache pencarian Drive per teks cell (hindari query ganda untuk teks sama)
  var driveCache = {};

  var ADVANCED = hasAdvancedDrive();
  if (!ADVANCED) {
    Logger.log("⚠ Advanced Drive Service TIDAK aktif → fallback DriveApp (Shared Drive tidak terlihat).");
    Logger.log("  Cara aktifkan: Apps Script editor → Services (➕) → Drive API → Add → Run ulang.");
  }

  var totals = { rows: 0, autoExact: 0, autoMirip: 0, review: 0, skipped: 0 };
  var logRows = [["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]];

  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (/^link resolution log$/i.test(name)) return; // jangan proses sheet log

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

    // ---- Deteksi header (sama seperti extractNotesToColumns & v1) ----
    var headerRange = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 10), lastCol);
    var headerVals = headerRange.getValues();
    var headerRow = -1, capCol = -1, preCol = -1, linkCol = -1, urlCol = -1;
    for (var r = 0; r < headerVals.length; r++) {
      for (var c = 0; c < headerVals[r].length; c++) {
        var h = String(headerVals[r][c] || "").trim();
        if (/^caption$/i.test(h)) { headerRow = r + 1; capCol = c + 1; }
        if (/prefilled\s*message/i.test(h)) { preCol = c + 1; }
        if (/^content\s*link$/i.test(h)) { linkCol = c + 1; }
        if (/content\s*link\s*\(url\)/i.test(h)) { urlCol = c + 1; }
      }
      if (capCol > 0 && preCol > 0) break;
    }
    if (capCol < 0 || preCol < 0 || linkCol < 0) return; // bukan tab klien

    var lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return;

    // Kolom (URL) wajib ada — buat jika belum (satu kolom setelah terakhir)
    if (urlCol < 0) urlCol = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, urlCol).setValue("Content Link (URL)");

    var dataRows = lastRow - headerRow;
    var linkVals = sheet.getRange(headerRow + 1, linkCol, dataRows, 1).getValues();
    var urlVals = sheet.getRange(headerRow + 1, urlCol, dataRows, 1).getValues();
    var urlRange = sheet.getRange(headerRow + 1, urlCol, dataRows, 1);

    var newUrls = [];
    var notes = [];
    var backgrounds = [];

    for (var i = 0; i < dataRows; i++) {
      var cellText = String(linkVals[i][0] || "").trim();
      var existingUrl = String(urlVals[i][0] || "").trim();
      var rowNo = headerRow + 1 + i;

      newUrls.push([existingUrl]);
      notes.push([""]);
      backgrounds.push([null]);

      // Lewati: kosong / sudah URL / placeholder / teks tampilan hyperlink
      if (!cellText) { totals.skipped++; continue; }
      if (/^https?:\/\//i.test(cellText)) { totals.skipped++; continue; }
      if (/paste\s*disini/i.test(cellText)) { totals.skipped++; continue; }
      if (/^(link|drive|di\s*note|copy\s*di\s*note)$/i.test(cellText)) { totals.skipped++; continue; }
      if (existingUrl && /^https?:\/\//i.test(existingUrl)) { totals.skipped++; continue; } // sudah terisi

      totals.rows++;

      // ---- Cari file di Drive (exact → norm → fuzzy) ----
      var res = searchSmart(cellText, driveCache, EXT_CANDIDATES);
      var picked = pickUnique(res);

      if (picked.file) {
        newUrls[i] = [urlFor(picked.file)];
        if (picked.level === "exact") {
          notes[i] = ["AUTO dari Drive: " + picked.file.name + (res.mode === "advanced" ? " (termasuk Shared Drive)" : "")];
          backgrounds[i] = ["#d9ead3"]; // hijau muda
          totals.autoExact++;
          logRows.push([name, rowNo, cellText, "AUTO", picked.file.name]);
        } else {
          var lbl = picked.level === "norm" ? "nama mirip" : "fuzzy";
          notes[i] = ["AUTO (" + lbl + " → " + picked.file.name + ") — mohon cek sebentar"];
          backgrounds[i] = ["#fff2cc"]; // kuning muda
          totals.autoMirip++;
          logRows.push([name, rowNo, cellText, "AUTO MIRIP", picked.file.name]);
        }
      } else {
        totals.review++;
        backgrounds[i] = ["#ffff00"]; // kuning
        if (picked.reason === "multi") {
          notes[i] = ["CEK MANUAL: " + picked.count + " file cocok → " + picked.names.slice(0, 5).join(" | ") + (picked.count > 5 ? " …" : "")];
          logRows.push([name, rowNo, cellText, "REVIEW", picked.count + " file cocok"]);
        } else {
          notes[i] = ["CEK MANUAL: tidak ada file cocok \"" + cellText + "\" (sudah dicari " + (res.mode === "advanced" ? "di semua Drive termasuk Shared Drive" : "di Drive pribadi saja — aktifkan Drive API service!") + ")"];
          logRows.push([name, rowNo, cellText, "REVIEW", "0 file ditemukan"]);
        }
      }
    }

    // Tulis hasil: URL, note, warna background
    urlRange.setValues(newUrls);
    urlRange.setNotes(notes);
    for (var k = 0; k < backgrounds.length; k++) {
      if (backgrounds[k][0]) {
        sheet.getRange(headerRow + 1 + k, urlCol).setBackground(backgrounds[k][0]);
      }
    }

    if (totals.rows > 0) {
      Logger.log("OK: " + name + " → diproses " + totals.rows + " baris");
    }
  });

  // ---- Tulis sheet log ringkasan ----
  var logSheet = null;
  for (var s = 0; s < ss.getSheets().length; s++) {
    if (/^link resolution log$/i.test(ss.getSheets()[s].getName())) { logSheet = ss.getSheets()[s]; break; }
  }
  if (!logSheet) logSheet = ss.insertSheet("Link Resolution Log");
  logSheet.clear();
  logSheet.getRange(1, 1, 1, 5).setValues([["RINGKASAN — SMART v2", "", "", "", ""]])
    .setFontWeight("bold");
  logSheet.getRange(2, 1, 7, 2).setValues([
    ["Mode pencarian", ADVANCED
      ? "Advanced Drive API — SEMUA Drive termasuk Shared Drive"
      : "DriveApp saja — Shared Drive TIDAK terlihat (aktifkan: Services ➕ → Drive API)"],
    ["Baris diproses", totals.rows],
    ["Auto persis (hijau)", totals.autoExact],
    ["Auto mirip (kuning muda)", totals.autoMirip],
    ["Perlu review (kuning)", totals.review],
    ["Dilewati (sudah URL/kosong)", totals.skipped],
    ["Waktu jalan", new Date().toLocaleString("id-ID")],
  ]);
  logSheet.getRange(10, 1, 1, 5).setValues([["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]])
    .setFontWeight("bold");
  if (logRows.length > 1) {
    logSheet.getRange(11, 1, logRows.length - 1, 5).setValues(logRows.slice(1));
  }
  logSheet.setColumnWidth(1, 160);
  logSheet.setColumnWidth(3, 260);
  logSheet.setColumnWidth(5, 320);
  logSheet.setFrozenRows(10);

  Logger.log("SELESAI. Diproses: " + totals.rows +
    " | AUTO persis: " + totals.autoExact +
    " | AUTO mirip: " + totals.autoMirip +
    " | REVIEW (kuning): " + totals.review +
    " | Skip: " + totals.skipped);
  Logger.log(">>> Cell KUNING = tim isi manual. Lalu: Publish ulang → node scripts/import-ads-creative-master.mjs <<<");
}

/* ============================================================================
 * HELPER
 * ========================================================================== */

/** Apakah Advanced Drive Service aktif? */
function hasAdvancedDrive() {
  return (typeof Drive !== "undefined") && Drive && Drive.Files;
}

/** Normalisasi nama file: lowercase, buang ekstensi, buang spasi & tanda baca */
function normBase(filename) {
  var s = String(filename || "").trim().toLowerCase();
  s = s.replace(/\.[a-z0-9]{2,5}$/, ""); // buang ekstensi terakhir
  s = s.replace(/[^a-z0-9]/g, "");        // buang semua non-alfanumerik
  return s;
}

/** Ambil run alfanumerik di awal teks (untuk query "name contains") */
function leadingAlnum(text) {
  var m = String(text || "").match(/^[a-zA-Z0-9]+/);
  return m ? m[0] : "";
}

/** Escape kutip & backslash untuk parameter q Drive API */
function escapeQ(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Bentuk URL tampilan dari objek file {id, isFolder} */
function urlFor(f) {
  return f.isFolder
    ? "https://drive.google.com/drive/folders/" + f.id
    : "https://drive.google.com/file/d/" + f.id + "/view";
}

/** Panggil Drive API (Advanced Service) — semua drive, paginasi, non-trash */
function listDriveApi(query) {
  var out = [];
  var token = null;
  do {
    var resp = Drive.Files.list({
      q: query,
      fields: "nextPageToken,items(id,name,mimeType)",
      maxResults: 200,
      pageToken: token,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: "allDrives"
    });
    (resp.items || []).forEach(function (it) {
      out.push({
        id: it.id,
        name: it.name,
        isFolder: it.mimeType === "application/vnd.google-apps.folder"
      });
    });
    token = resp.nextPageToken;
  } while (token && out.length < 1000);
  return out;
}

/**
 * Pencarian utama. Return { exact:[], norm:[], fuzzy:[], mode:"advanced"|"basic" }
 * mode "advanced" = via Drive API (semua Drive); "basic" = via DriveApp.
 */
function searchSmart(text, cache, extCandidates) {
  if (cache[text]) return cache[text];

  var result;

  if (hasAdvancedDrive()) {
    result = { exact: [], norm: [], fuzzy: [], mode: "advanced" };
    try {
      // 1) Nama persis
      result.exact = listDriveApi("name = '" + escapeQ(text) + "' and trashed = false");

      // 2) Fuzzy: query kandidat lewat prefix, cocokkan lokal via normalisasi
      if (result.exact.length === 0) {
        var target = normBase(text);
        var prefix = leadingAlnum(text);
        if (target.length >= 2 && prefix.length >= 2) {
          var cands = listDriveApi("name contains '" + escapeQ(prefix) + "' and trashed = false");
          cands.forEach(function (c) {
            var nb = normBase(c.name);
            if (nb === target) result.norm.push(c);
            else if (nb.indexOf(target) === 0) result.fuzzy.push(c);
          });
        }
      }
    } catch (e) {
      Logger.log("⚠ Drive API error utk \"" + text + "\": " + e + " → fallback DriveApp");
      result = searchBasic(text, extCandidates);
    }
  } else {
    result = searchBasic(text, extCandidates);
  }

  cache[text] = result;
  return result;
}

/** Fallback DriveApp (perilaku v1) — hanya Drive pribadi + shared-with-me */
function searchBasic(text, extCandidates) {
  var result = { exact: [], norm: [], fuzzy: [], mode: "basic" };
  var seen = {};
  function push(file) {
    var id = file.getId();
    if (seen[id]) return;
    seen[id] = 1;
    result.exact.push({ id: id, name: file.getName(), isFolder: false });
  }
  var it = DriveApp.getFilesByName(text);
  while (it.hasNext()) push(it.next());

  // Nama generik tanpa ekstensi → coba tambahkan ekstensi umum
  if (result.exact.length === 0 && !/\.[a-z0-9]{2,5}$/i.test(text)) {
    for (var i = 0; i < extCandidates.length; i++) {
      var it2 = DriveApp.getFilesByName(text + extCandidates[i]);
      while (it2.hasNext()) push(it2.next());
    }
  }
  return result;
}

/** Hilangkan file duplikat (ID sama) dari sebuah array hasil */
function dedupById(files) {
  var seen = {}, out = [];
  files.forEach(function (f) {
    if (!seen[f.id]) { seen[f.id] = 1; out.push(f); }
  });
  return out;
}

/**
 * Tentukan file terpilih dari hasil pencarian, level demi level:
 * exact → norm → fuzzy. Auto HANYA jika tepat 1 file unik di level tsb.
 */
function pickUnique(res) {
  var levels = [
    { level: "exact", files: dedupById(res.exact || []) },
    { level: "norm", files: dedupById(res.norm || []) },
    { level: "fuzzy", files: dedupById(res.fuzzy || []) }
  ];
  for (var g = 0; g < levels.length; g++) {
    if (levels[g].files.length === 1) {
      return { file: levels[g].files[0], level: levels[g].level };
    }
    if (levels[g].files.length > 1) {
      var names = levels[g].files.map(function (f) { return f.name; });
      return { file: null, reason: "multi", count: levels[g].files.length, names: names };
    }
  }
  return { file: null, reason: "zero" };
}