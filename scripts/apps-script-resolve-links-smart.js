/**
 * ============================================================================
 * RESOLVE CONTENT LINK → URL (VERSI SMART v2.2 — BULK INDEX + lokal match)
 * ============================================================================
 * Riwayat versi:
 *  - v1   : DriveApp.getFilesByName — tidak lihat Shared Drive, harus persis.
 *  - v2   : Drive API per-nama — bug: sintaks v3 dipakai di service v2
 *           → semua query "Invalid query" → AUTO = 0.
 *  - v2.1 : auto-detect dialek v2 (title) / v3 (name) → query jalan,
 *           tapi hanya 7 terisi karena query Drive CASE-SENSITIVE dan
 *           fuzzy lama butuh prefix ≥ 2 karakter.
 *  - v2.2 : TIDAK ADA query per-nama lagi. Sekali di awal, tarik DAFTAR
 *           SEMUA file yang bisa diakses akun (My Drive + Shared Drive,
 *           non-trash, paginasi, cap 30.000 file) → INDEX. Semua
 *           pencocokan dilakukan LOKAL di index:
 *             exact : judul sama persis (abaikan besar/kecil)
 *             norm  : sama setelah normalisasi (spasi/tanda baca/ekstensi
 *                     dibuang) → "Brief 4" ≈ "Brief 4.mp4" ≈ "BRIEF4"
 *             fuzzy : nama file (ternormalisasi) MULAI dengan teks cell
 *                     (ternormalisasi) — bekerja juga utk "3 agustus", "1.jpg"
 *
 * Aturan aman (tetap sama):
 *  - Baris yang kolom (URL)-nya sudah terisi URL → DILEWATI (tidak ditimpa)
 *  - Auto-fill HANYA jika tepat 1 file unik pada level tsb:
 *      exact → HIJAU muda; norm/fuzzy → KUNING muda + note "mohon cek"
 *  - 0 file atau >1 file → cell KUNING + note "CEK MANUAL" (+ daftar nama)
 *
 * PENTING soal hasil kecil: kalau setelah v2.2 masih banyak
 * "0 file ditemukan", berarti folder aset TIDAK di-share ke akun Google
 * yang menjalankan script ini. Solusi: share folder aset (Viewer saja)
 * ke akun tsb → Run ulang. (Cek angka "Index file" di log — kalau
 * kecil, akun memang tidak melihat banyak file.)
 *
 * ============================================================================
 * CARA PAKAI (di SHEET ASLI — bukan link publish):
 * ============================================================================
 * 1. Buka spreadsheet Google Sheets ASLI → Extensions → Apps Script.
 * 2. Pastikan Advanced Drive Service aktif (sekali saja):
 *       Sidebar "Services" → ➕ → Drive API → identifier "Drive" → Add.
 *       (HANYA SATU — kalau muncul error "identifier used more than once:
 *        Drive", hapus salah satu yang dobel.)
 * 3. Paste SEMUA kode ini (ganti total isi file lama — versi ini v2.2).
 * 4. Save 💾 → pilih fungsi `resolveContentLinksSmart` → Run ▶.
 * 5. Permission pertama kali: "Review permissions" → pilih akun →
 *    "Advanced" → "Go to ... (unsafe)" → Allow.
 * 6. Tunggu log "SELESAI". Cek angka "Index file: N" — makin besar makin
 *    baik. Lalu cek "AUTO persis/mirip" — harusnya jauh lebih banyak
 *    dari run sebelumnya (7).
 * 7. Cek sheet "Link Resolution Log" → tabis per baris.
 * 8. Cell KUNING = ambigu/tidak ketemu → tim isi manual URL-nya.
 * 9. File → Share → Publish to web → **Publish ulang** (re-publish).
 *10. Jalankan: node scripts/import-ads-creative-master.mjs
 *11. Verifikasi: node scripts/audit-ads-creative-completeness.mjs
 *
 * CATATAN:
 * - Idempotent: hanya proses baris yang kolom (URL)-nya kosong → aman
 *   dijalankan berulang (setelah tim tambah konten baru, dsb).
 * - Jalankan dari akun Google yang punya akses ke folder aset klien.
 * ============================================================================
 */

var MAX_INDEX = 30000; // batas aman jumlah file yang di-index

function resolveContentLinksSmart() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  var ADVANCED = hasAdvancedDrive();
  if (!ADVANCED) {
    Logger.log("⚠ Advanced Drive Service TIDAK aktif → fallback DriveApp (Shared Drive tidak terlihat).");
    Logger.log("  Cara aktifkan: Apps Script editor → Services (➕) → Drive API → Add → Run ulang.");
  }

  // ---- BANGUN INDEX SEMUA FILE (sekali saja, di awal) ----
  var INDEX = null;
  if (ADVANCED) {
    try {
      INDEX = buildIndex();
      Logger.log("✓ Index selesai: " + INDEX.length + " file terlihat oleh akun ini" +
        (INDEX.length >= MAX_INDEX ? " (CAP " + MAX_INDEX + " tercapai — mungkin ada file lagi)" : ""));
      Logger.log("✓ Drive API dialek: " + (DRIVE_DIALECT || "?"));
    } catch (e) {
      INDEX = null;
      Logger.log("⚠ Gagal bangun index (" + e + ") → fallback DriveApp per-nama. Kirim log ini ke developer.");
    }
  }

  var totals = { rows: 0, autoExact: 0, autoMirip: 0, review: 0, skipped: 0 };
  var logRows = [["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]];

  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (/^link resolution log$/i.test(name)) return; // jangan proses sheet log

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

    // ---- Deteksi header (sama seperti versi sebelumnya) ----
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

    // Kolom (URL) wajib ada — buat jika belum
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

      // ---- Cari file (INDEX lokal → fallback DriveApp) ----
      var res = (INDEX)
        ? searchIndex(INDEX, cellText)
        : searchBasic(cellText);
      var picked = pickUnique(res);

      if (picked.file) {
        newUrls[i] = [urlFor(picked.file)];
        if (picked.level === "exact") {
          notes[i] = ["AUTO dari Drive: " + picked.file.name + " (semua Drive termasuk Shared Drive)"];
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
          var cariDi = INDEX
            ? "semua Drive yang terlihat akun ini (" + INDEX.length + " file di index)"
            : "Drive pribadi saja (Drive API service tidak aktif / gagal)";
          notes[i] = ["CEK MANUAL: tidak ada file cocok \"" + cellText + "\" (dicari di " + cariDi + "). Kalau file ada, pastikan folder aset di-share ke akun yang menjalankan script ini."];
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
  logSheet.getRange(1, 1, 1, 5).setValues([["RINGKASAN — SMART v2.2", "", "", "", ""]])
    .setFontWeight("bold");
  logSheet.getRange(2, 1, 8, 2).setValues([
    ["Mode pencarian", INDEX
      ? "BULK INDEX lokal — semua Drive yang terlihat akun (dialek Drive API: " + (DRIVE_DIALECT || "?") + ")"
      : "DriveApp per-nama — Shared Drive TIDAK terlihat"],
    ["Jumlah file di index", INDEX ? INDEX.length : 0],
    ["Baris diproses", totals.rows],
    ["Auto persis (hijau)", totals.autoExact],
    ["Auto mirip (kuning muda)", totals.autoMirip],
    ["Perlu review (kuning)", totals.review],
    ["Dilewati (sudah URL/kosong)", totals.skipped],
    ["Waktu jalan", new Date().toLocaleString("id-ID")],
  ]);
  logSheet.getRange(11, 1, 1, 5).setValues([["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]])
    .setFontWeight("bold");
  if (logRows.length > 1) {
    logSheet.getRange(12, 1, logRows.length - 1, 5).setValues(logRows.slice(1));
  }
  logSheet.setColumnWidth(1, 160);
  logSheet.setColumnWidth(3, 260);
  logSheet.setColumnWidth(5, 320);
  logSheet.setFrozenRows(11);

  Logger.log("SELESAI. Diproses: " + totals.rows +
    " | AUTO persis: " + totals.autoExact +
    " | AUTO mirip: " + totals.autoMirip +
    " | REVIEW (kuning): " + totals.review +
    " | Skip: " + totals.skipped +
    " | Index file: " + (INDEX ? INDEX.length : 0) +
    " | Dialek: " + (DRIVE_DIALECT || "-"));
  Logger.log(">>> Kalau REVIEW masih besar & index kecil → share folder aset ke akun script, lalu Run ulang. <<<");
  Logger.log(">>> Cell KUNING = tim isi manual. Lalu: Publish ulang → node scripts/import-ads-creative-master.mjs <<<");
}

/* ============================================================================
 * HELPER
 * ========================================================================== */

/** Apakah Advanced Drive Service aktif? */
function hasAdvancedDrive() {
  return (typeof Drive !== "undefined") && Drive && Drive.Files;
}

/* ---- Drive API dialect (v2: title/maxResults/items, v3: name/pageSize/files) */
var DRIVE_DIALECT = null; // "v2" | "v3" — di-set otomatis saat halaman pertama

/** Ambil SATU halaman daftar file (tanpa filter nama) sesuai dialek */
function indexPage(token) {
  var params = {
    q: "trashed = false",
    pageToken: token || null,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives"
  };
  if (DRIVE_DIALECT === "v2") {
    params.maxResults = 1000;
    params.fields = "nextPageToken,items(id,title,mimeType)";
  } else {
    params.pageSize = 1000;
    params.fields = "nextPageToken,files(id,name,mimeType)";
  }
  return Drive.Files.list(params);
}

/**
 * Bangun INDEX semua file yang terlihat akun: My Drive + Shared Drive,
 * non-trash, paginasi penuh, cap MAX_INDEX. Return array
 * { id, name, lower, norm, isFolder }.
 */
function buildIndex() {
  var index = [];

  // Deteksi dialek dengan halaman pertama (coba v2 → v3)
  var resp = null;
  DRIVE_DIALECT = "v2";
  try {
    resp = indexPage(null);
  } catch (e2) {
    if (!/invalid query/i.test(String(e2 && e2.message || e2))) throw e2;
    DRIVE_DIALECT = "v3";
    resp = indexPage(null); // kalau ini juga gagal → throw ke pemanggil
  }

  var token = null;
  var pages = 0;
  do {
    if (resp === null) resp = indexPage(token);
    pages++;
    var arr = (DRIVE_DIALECT === "v2") ? (resp.items || []) : (resp.files || []);
    for (var i = 0; i < arr.length; i++) {
      var nm = (DRIVE_DIALECT === "v2") ? arr[i].title : arr[i].name;
      index.push({
        id: arr[i].id,
        name: nm,
        lower: String(nm || "").toLowerCase(),
        norm: normBase(nm),
        isFolder: arr[i].mimeType === "application/vnd.google-apps.folder"
      });
    }
    token = resp.nextPageToken || null;
    resp = null;
    if (index.length % 5000 < 1000) {
      Logger.log("… indexing: " + index.length + " file…"); // progress ringan
    }
  } while (token && index.length < MAX_INDEX);

  Logger.log("Index: " + index.length + " file / " + pages + " halaman (dialek " + DRIVE_DIALECT + ")");
  return index;
}

/** Normalisasi nama: lowercase, buang ekstensi, buang non-alfanumerik */
function normBase(filename) {
  var s = String(filename || "").trim().toLowerCase();
  s = s.replace(/\.[a-z0-9]{2,5}$/, ""); // buang ekstensi terakhir
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

/** Bentuk URL tampilan dari objek file {id, isFolder} */
function urlFor(f) {
  return f.isFolder
    ? "https://drive.google.com/drive/folders/" + f.id
    : "https://drive.google.com/file/d/" + f.id + "/view";
}

/**
 * Pencocokan LOKAL terhadap INDEX. Return { exact, norm, fuzzy }.
 *  exact : judul sama persis (case-insensitive)
 *  norm  : ternormalisasi sama (abaikan spasi/tanda baca/ekstensi)
 *  fuzzy : norm(file) MULAI dengan norm(cell) — min 2 karakter
 */
function searchIndex(index, text) {
  var lower = String(text).toLowerCase();
  var target = normBase(text);
  var res = { exact: [], norm: [], fuzzy: [] };

  for (var i = 0; i < index.length; i++) {
    var f = index[i];
    if (f.lower === lower) {
      res.exact.push(f);
      continue; // exact menang — tidak perlu cek level lain utk file ini
    }
    if (target.length >= 2) {
      if (f.norm === target) res.norm.push(f);
      else if (f.norm.indexOf(target) === 0) res.fuzzy.push(f);
    }
  }
  return res;
}

/** Fallback DriveApp per-nama (kalau index gagal / service mati) */
function searchBasic(text) {
  var EXT = [".mp4", ".mov", ".jpg", ".jpeg", ".png", ".webp"];
  var res = { exact: [], norm: [], fuzzy: [] };
  var seen = {};
  function push(file) {
    var id = file.getId();
    if (seen[id]) return;
    seen[id] = 1;
    res.exact.push({ id: id, name: file.getName(), isFolder: false });
  }
  var it = DriveApp.getFilesByName(text);
  while (it.hasNext()) push(it.next());
  if (res.exact.length === 0 && !/\.[a-z0-9]{2,5}$/i.test(text)) {
    for (var i = 0; i < EXT.length; i++) {
      var it2 = DriveApp.getFilesByName(text + EXT[i]);
      while (it2.hasNext()) push(it2.next());
    }
  }
  return res;
}

/** Hilangkan duplikat (ID sama) */
function dedupById(files) {
  var seen = {}, out = [];
  files.forEach(function (f) {
    if (!seen[f.id]) { seen[f.id] = 1; out.push(f); }
  });
  return out;
}

/**
 * Pilih file: exact → norm → fuzzy. Auto HANYA jika tepat 1 unik di level tsb.
 * >1 → { reason:"multi", count, names }; 0 → { reason:"zero" }.
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