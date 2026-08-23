/**
 * ============================================================================
 * RESOLVE CONTENT LINK → URL DARI GOOGLE DRIVE (auto-fill aman + review)
 * ============================================================================
 * Masalah: 65 baris di tab klien punya kolom "Content Link" berisi NAMA FILE
 * (mis. "Brief1_AUM_Nov.mp4", "LEGGING ADS.mp4") — bukan URL. Dashboard tidak
 * bisa menampilkan link yang bisa diklik.
 *
 * Script ini mencari file bernama PERSIS itu di Google Drive akun Anda,
 * lalu menulis URL-nya ke kolom "Content Link (URL)" (kolom hasil script
 * extractNotesToColumns — TIDAK menimpa cell asli / non-destruktif).
 *
 * Aturan aman:
 *  - Tepat 1 file cocok           → tulis URL otomatis ✅
 *  - 0 file atau >1 file cocok    → cell di-highlight KUNING + note
 *                                   "CEK MANUAL" — tim tinggal review 🔍
 *  - Baris yang (URL)-nya sudah terisi → dilewati (tidak pernah ditimpa)
 *
 * ============================================================================
 * CARA PAKAI (di SHEET ASLI — bukan link publish):
 * ============================================================================
 * 1. Buka spreadsheet Google Sheets ASLI.
 * 2. Menu: Extensions → Apps Script.
 * 3. Tambahkan file baru (＋ di samping Files) → paste SEMUA kode ini.
 *    (Boleh satu project dengan script extractNotesToColumns.)
 * 4. Save 💾 → pilih fungsi `resolveContentLinksFromDrive` → Run ▶.
 * 5. Permission pertama kali: "Review permissions" → pilih akun →
 *    "Advanced" → "Go to ... (unsafe)" → Allow.
 *    (Scope tambahan Drive diperlukan untuk mencari file.)
 * 6. Tunggu log "SELESAI". Cek sheet "Link Resolution Log" untuk ringkasan.
 * 7. Cell KUNING di kolom (URL) = ambigu → tim isi manual URL-nya.
 * 8. File → Share → Publish to web → **Publish ulang** (re-publish).
 * 9. Jalankan: node scripts/import-ads-creative-master.mjs
 *10. Verifikasi: node scripts/audit-ads-creative-completeness.mjs
 *
 * CATATAN PENTING:
 * - Jalankan dari akun Google yang punya akses ke folder Drive aset klien.
 *   File di Drive yang TIDAK dibagikan ke akun ini tidak akan ketemu.
 * - Bisa dijalankan berulang (idempotent): hanya proses baris yang (URL)-nya
 *   masih kosong, jadi aman setelah tim menambah konten baru.
 * ============================================================================
 */

function resolveContentLinksFromDrive() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  // Ekstensi umum untuk kandidat nama generik tanpa ekstensi (mis. "Brief1")
  const EXT_CANDIDATES = [".mp4", ".mov", ".jpg", ".jpeg", ".png", ".webp"];

  // Cache pencarian Drive per nama file (hindari query ganda untuk nama sama)
  var driveCache = {};

  var totals = { rows: 0, auto: 0, review: 0, skipped: 0 };
  var logRows = [["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]];

  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (/^link resolution log$/i.test(name)) return; // jangan proses sheet log

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

    // ---- Deteksi header (sama seperti extractNotesToColumns) ----
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
    if (urlCol < 0) {
      urlCol = sheet.getLastColumn() + 1;
      sheet.getRange(headerRow, urlCol).setValue("Content Link (URL)");
    }
    // Pastikan header kolom (URL) tertulis
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

      // ---- Cari file di Drive ----
      var result = searchDrive(cellText, driveCache, EXT_CANDIDATES);
      var found = result.files;
      var viaExt = result.viaExt;

      if (found.length === 1) {
        // Tepat 1 file → auto-fill
        var url = found[0].getUrl();
        newUrls[i] = [url];
        if (viaExt) {
          // Nama generik cocok lewat kandidat ekstensi → tetap flag review ringan
          notes[i] = ["AUTO (generik→" + found[0].getName() + ") — mohon cek sebentar"];
          backgrounds[i] = ["#fff2cc"]; // kuning muda
        } else {
          notes[i] = ["AUTO dari Drive: " + found[0].getName()];
          backgrounds[i] = ["#d9ead3"]; // hijau muda
        }
        totals.auto++;
        logRows.push([name, rowNo, cellText, "AUTO", found[0].getName()]);
      } else if (found.length === 0) {
        totals.review++;
        backgrounds[i] = ["#ffff00"]; // kuning
        notes[i] = ["CEK MANUAL: tidak ada file bernama persis \"" + cellText + "\" di Drive akun ini"];
        logRows.push([name, rowNo, cellText, "REVIEW", "0 file ditemukan"]);
      } else {
        totals.review++;
        var names = [];
        found.forEach(function (f) { names.push(f.getName()); });
        backgrounds[i] = ["#ffff00"]; // kuning
        notes[i] = ["CEK MANUAL: " + found.length + " file bernama sama → " + names.slice(0, 5).join(" | ") + (found.length > 5 ? " …" : "")];
        logRows.push([name, rowNo, cellText, "REVIEW", found.length + " file duplikat nama"]);
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
  logSheet.getRange(1, 1, 1, 5).setValues([["RINGKASAN", "", "", "", ""]])
    .setFontWeight("bold");
  logSheet.getRange(2, 1, 5, 2).setValues([
    ["Baris diproses", totals.rows],
    ["Auto terisi (1 file)", totals.auto],
    ["Perlu review (kuning)", totals.review],
    ["Dilewati (sudah URL/kosong)", totals.skipped],
    ["Waktu jalan", new Date().toLocaleString("id-ID")],
  ]);
  logSheet.getRange(8, 1, 1, 5).setValues([["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]])
    .setFontWeight("bold");
  if (logRows.length > 1) {
    logSheet.getRange(9, 1, logRows.length - 1, 5).setValues(logRows.slice(1));
  }
  logSheet.setColumnWidth(1, 160);
  logSheet.setColumnWidth(3, 260);
  logSheet.setColumnWidth(5, 320);
  logSheet.setFrozenRows(8);

  Logger.log("SELESAI. Diproses: " + totals.rows + " | AUTO: " + totals.auto + " | REVIEW (kuning): " + totals.review + " | Skip: " + totals.skipped);
  Logger.log(">>> Cell KUNING di kolom (URL) = tim isi manual. Lalu: Publish ulang → node scripts/import-ads-creative-master.mjs <<<");
}

/**
 * Cari file di Drive berdasarkan nama persis.
 * Jika tidak ketemu DAN nama tanpa ekstensi (generik), coba tambahkan
 * kandidat ekstensi umum (.mp4/.jpg/...) — hanya auto jika total 1 file unik.
 */
function searchDrive(filename, cache, extCandidates) {
  if (cache[filename]) return cache[filename];

  var files = collectFiles(DriveApp.getFilesByName(filename));
  var viaExt = false;

  if (files.length === 0 && !/\.[a-z0-9]{2,5}$/i.test(filename)) {
    // Nama generik tanpa ekstensi → coba kandidat ekstensi
    var seen = {};
    var merged = [];
    for (var i = 0; i < extCandidates.length; i++) {
      var it = DriveApp.getFilesByName(filename + extCandidates[i]);
      while (it.hasNext()) {
        var f = it.next();
        if (!seen[f.getId()]) { seen[f.getId()] = true; merged.push(f); }
      }
    }
    if (merged.length > 0) { files = merged; viaExt = true; }
  }

  cache[filename] = { files: files, viaExt: viaExt };
  return cache[filename];
}

function collectFiles(iterator) {
  var out = [];
  while (iterator.hasNext()) out.push(iterator.next());
  return out;
}