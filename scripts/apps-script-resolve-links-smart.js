/**
 * ============================================================================
 * RESOLVE CONTENT LINK → URL (VERSI SMART v2.1 — Shared Drive + fuzzy match)
 * ============================================================================
 * Kelemahan v1 (resolveContentLinksFromDrive) yang diperbaiki:
 *  1. DriveApp.getFilesByName() TIDAK bisa menemukan file di Shared Drive
 *     (Team Drive) — padahal aset klien sering disimpan di sana.
 *  2. Nama harus PERSIS sama — "Brief 5" tidak ketemu kalau file bernama
 *     "Brief5.mp4" (beda spasi / ekstensi / huruf besar-kecil).
 *
 * FIX v2.1 (penting!): Advanced Drive Service bisa v2 atau v3.
 *  - v2 pakai field "title", param "maxResults", hasil "items"
 *  - v3 pakai field "name",   param "pageSize",  hasil "files"
 * Versi script sebelumnya SELALU pakai sintaks v3 → di service v2 SEMUA
 * query gagal "Invalid query" dan tidak ada satu pun baris terisi.
 * Sekarang dialek dideteksi OTOMATIS saat query pertama (coba v2 dulu,
 * kalau "Invalid query" ganti v3), lalu diingat untuk sisa run, dan
 * dilaporkan di execution log + sheet "Link Resolution Log".
 *
 * Fitur script ini:
 *  1. Pakai Advanced Drive Service dengan supportsAllDrives +
 *     includeItemsFromAllDrives + corpora=allDrives
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
 *  3. Tetap non-destruktif + aturan aman:
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
 * 3. Tambahkan file script baru (＋ di samping Files) → paste SEMUA kode ini.
 *    (Ganti total isi file versi lama kalau sudah ada — script ini v2.1.)
 * 4. Save 💾 → pilih fungsi `resolveContentLinksSmart` → Run ▶.
 * 5. Permission pertama kali: "Review permissions" → pilih akun →
 *    "Advanced" → "Go to ... (unsafe)" → Allow.
 * 6. Tunggu log "SELESAI". PASTIKAN di log ada baris:
 *       "✓ Drive API dialek terdeteksi: v2 (field 'title')"  — atau v3
 *    dan TIDAK ada baris "⚠ Drive API error".
 * 7. Cek sheet "Link Resolution Log" untuk ringkasan per baris.
 * 8. Cell KUNING di kolom (URL) = ambigu → tim isi manual URL-nya.
 * 9. File → Share → Publish to web → **Publish ulang** (re-publish).
 *10. Jalankan: node scripts/import-ads-creative-master.mjs
 *11. Verifikasi: node scripts/audit-ads-creative-completeness.mjs
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
  logSheet.getRange(1, 1, 1, 5).setValues([["RINGKASAN — SMART v2.1", "", "", "", ""]])
    .setFontWeight("bold");
  logSheet.getRange(2, 1, 7, 2).setValues([
    ["Mode pencarian", ADVANCED
      ? "Advanced Drive API — SEMUA Drive termasuk Shared Drive (dialek: " + (DRIVE_DIALECT || "belum terdeteksi") + ")"
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
    " | Skip: " + totals.skipped +
    " | Dialek Drive API: " + (DRIVE_DIALECT || "tidak terdeteksi"));
  Logger.log(">>> Kalau AUTO = 0 dan banyak ⚠ error → kirim log ke developer. <<<");
  Logger.log(">>> Cell KUNING = tim isi manual. Lalu: Publish ulang → node scripts/import-ads-creative-master.mjs <<<");
}

/* ============================================================================
 * HELPER
 * ========================================================================== */

/** Apakah Advanced Drive Service aktif? */
function hasAdvancedDrive() {
  return (typeof Drive !== "undefined") && Drive && Drive.Files;
}

/* ---- Drive API dialect handling (FIX v2.1) -------------------------------
 * Advanced Drive Service bisa v2 (field "title", param maxResults, hasil
 * "items") atau v3 (field "name", param pageSize, hasil "files").
 * Dialek dideteksi otomatis sekali saat query pertama, lalu diingat.
 * ------------------------------------------------------------------------ */
var DRIVE_DIALECT = null; // "v2" | "v3" — di-set otomatis saat query pertama

/** Nama field judul file sesuai dialek */
function fieldName() {
  return DRIVE_DIALECT === "v2" ? "title" : "name";
}

/** Apakah error tersebut "Invalid query" (tanda salah dialek)? */
function isInvalidQuery(e) {
  var msg = (e && e.message) ? e.message : String(e);
  return /invalid query/i.test(msg);
}

/** Ambil SATU halaman hasil dari Drive.Files.list sesuai dialek */
function listPage(fieldValue, mode, token) {
  var op = (mode === "contains") ? "contains" : "=";
  var q = fieldName() + " " + op + " '" + escapeQ(fieldValue) + "' and trashed = false";
  var params = {
    q: q,
    pageToken: token || null,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives"
  };
  if (DRIVE_DIALECT === "v2") {
    params.maxResults = 200;                                   // v2
    params.fields = "nextPageToken,items(id,title,mimeType)";  // v2
  } else {
    params.pageSize = 200;                                   // v3
    params.fields = "nextPageToken,files(id,name,mimeType)"; // v3
  }
  var resp = Drive.Files.list(params);
  var arr = (DRIVE_DIALECT === "v2") ? (resp.items || []) : (resp.files || []);
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    out.push({
      id: arr[i].id,
      name: (DRIVE_DIALECT === "v2") ? arr[i].title : arr[i].name,
      isFolder: arr[i].mimeType === "application/vnd.google-apps.folder"
    });
  }
  return { files: out, nextToken: resp.nextPageToken || null };
}

/** Lanjutkan pagination dari halaman pertama yang sudah didapat */
function collectRest(firstPage, fieldValue, mode) {
  var out = firstPage.files;
  var token = firstPage.nextToken;
  while (token && out.length < 1000) {
    var pg = listPage(fieldValue, mode, token);
    out = out.concat(pg.files);
    token = pg.nextToken;
  }
  return out;
}

/**
 * Pencarian penuh via Drive API — semua drive, non-trash, dengan pagination.
 * Saat pemanggilan PERTAMA: coba dialek v2 ("title"); kalau Invalid query →
 * ganti v3 ("name"). Dialek yang sukses diingat (DRIVE_DIALECT) permanen.
 * mode: "exact" (judul = teks) atau "contains" (judul mengandung teks).
 */
function listDriveApi(fieldValue, mode) {
  if (!DRIVE_DIALECT) {
    DRIVE_DIALECT = "v2";
    try {
      var page2 = listPage(fieldValue, mode, null);
      Logger.log("✓ Drive API dialek terdeteksi: v2 (field 'title')");
      return collectRest(page2, fieldValue, mode);
    } catch (e2) {
      if (!isInvalidQuery(e2)) { DRIVE_DIALECT = null; throw e2; }
      DRIVE_DIALECT = "v3";
      try {
        var page3 = listPage(fieldValue, mode, null);
        Logger.log("✓ Drive API dialek terdeteksi: v3 (field 'name')");
        return collectRest(page3, fieldValue, mode);
      } catch (e3) {
        DRIVE_DIALECT = null; // gagal deteksi — run berikutnya coba lagi
        throw e3;
      }
    }
  }
  return collectRest(listPage(fieldValue, mode, null), fieldValue, mode);
}

/** Normalisasi nama file: lowercase, buang ekstensi, buang spasi & tanda baca */
function normBase(filename) {
  var s = String(filename || "").trim().toLowerCase();
  s = s.replace(/\.[a-z0-9]{2,5}$/, ""); // buang ekstensi terakhir
  s = s.replace(/[^a-z0-9]/g, "");        // buang semua non-alfanumerik
  return s;
}

/** Ambil run alfanumerik di awal teks (untuk query contains) */
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
      result.exact = listDriveApi(text, "exact");

      // 2) Fuzzy: query kandidat lewat prefix, cocokkan lokal via normalisasi
      if (result.exact.length === 0) {
        var target = normBase(text);
        var prefix = leadingAlnum(text);
        if (target.length >= 2 && prefix.length >= 2) {
          var cands = listDriveApi(prefix, "contains");
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