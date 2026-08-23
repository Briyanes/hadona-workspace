/**
 * ============================================================================
 * RESOLVE CONTENT LINK -> URL (SMART v2.4 - + SHARED-WITH-ME PASS + DEDUP)
 * ============================================================================
 * Riwayat:
 *  - v2.1: query per-nama (case-sensitive) -> hanya 7 match.
 *  - v2.2: bulk index corpora=allDrives (2087 file) + prefix match -> AUTO=0.
 *  - v2.3: index PER-DRIVE (My Drive + Drives.list) + contains match.
 *          Hasil run: AUTO=1, index 2087, "1 sumber" => akun script tidak
 *          punya akses Shared Drive manapun; Drives.list = kosong.
 *  - v2.4: celah terakhir = file "Shared with me" (milik rekan, di-share
 *          ke akun script) TIDAK muncul di corpus default maupun Drives.list.
 *          -> tambah pass q:"sharedWithMe = true" + dedup antar sumber
 *             (file sama dari >1 corpus tidak dihitung 2x).
 *
 * Aturan aman (tetap):
 *  - URL yang sudah terisi TIDAK ditimpa (itulah kenapa ada "Skip")
 *  - Auto hanya jika kandidat UNIK; >1 kandidat -> kuning + daftar nama
 *
 * CARA PAKAI: paste total di Apps Script sheet ASLI -> Run
 * resolveContentLinksSmart -> baca sheet "Link Resolution Log":
 *   - SUMBER INDEX: kalau "Shared with me" 0/nol file juga, berarti aset
 *     ada di akun lain yang belum share ke akun script -> minta share
 *     folder aset ke akun yang menjalankan script -> Run ulang.
 * ============================================================================
 */

var MAX_INDEX = 30000;
var SAMPLE_SIZE = 200;

function resolveContentLinksSmart() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  var ADVANCED = hasAdvancedDrive();
  if (!ADVANCED) {
    Logger.log("⚠ Advanced Drive Service TIDAK aktif -> fallback DriveApp (Shared Drive tidak terlihat).");
  }

  // ---- BANGUN INDEX ----
  var INDEX = null;
  var SOURCES = []; // [nama sumber, jumlah file] atau [nama, "GAGAL: pesan"]
  if (ADVANCED) {
    try {
      INDEX = buildIndex(SOURCES);
      Logger.log("✓ Index selesai: " + INDEX.length + " file (unik) dari " + SOURCES.length + " sumber (dialek " + DRIVE_DIALECT + ")" +
        (INDEX.length >= MAX_INDEX ? " [CAP " + MAX_INDEX + " tercapai]" : ""));
      for (var si = 0; si < SOURCES.length; si++) {
        Logger.log("   • " + SOURCES[si][0] + ": " + SOURCES[si][1] + " file");
      }
    } catch (e) {
      INDEX = null;
      Logger.log("⚠ Gagal bangun index (" + e + ") -> fallback DriveApp. Kirim log ini ke developer.");
    }
  }

  var totals = { rows: 0, autoExact: 0, autoMirip: 0, review: 0, skipped: 0 };
  var logRows = [["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]];

  sheets.forEach(function (sheet) {
    var name = sheet.getName();
    if (/^link resolution log$/i.test(name)) return;

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

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
    if (capCol < 0 || preCol < 0 || linkCol < 0) return;

    var lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return;

    if (urlCol < 0) urlCol = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, urlCol).setValue("Content Link (URL)");

    var dataRows = lastRow - headerRow;
    var linkVals = sheet.getRange(headerRow + 1, linkCol, dataRows, 1).getValues();
    var urlVals = sheet.getRange(headerRow + 1, urlCol, dataRows, 1).getValues();
    var urlRange = sheet.getRange(headerRow + 1, urlCol, dataRows, 1);

    var newUrls = [], notes = [], backgrounds = [];

    for (var i = 0; i < dataRows; i++) {
      var cellText = String(linkVals[i][0] || "").trim();
      var existingUrl = String(urlVals[i][0] || "").trim();
      var rowNo = headerRow + 1 + i;

      newUrls.push([existingUrl]);
      notes.push([""]);
      backgrounds.push([null]);

      if (!cellText) { totals.skipped++; continue; }
      if (/^https?:\/\//i.test(cellText)) { totals.skipped++; continue; }
      if (/paste\s*disini/i.test(cellText)) { totals.skipped++; continue; }
      if (/^(link|drive|di\s*note|copy\s*di\s*note)$/i.test(cellText)) { totals.skipped++; continue; }
      if (existingUrl && /^https?:\/\//i.test(existingUrl)) { totals.skipped++; continue; } // terlindungi

      totals.rows++;

      var res = (INDEX) ? searchIndex(INDEX, cellText) : searchBasic(cellText);
      var picked = pickUnique(res);

      if (picked.file) {
        newUrls[i] = [urlFor(picked.file)];
        if (picked.level === "exact") {
          notes[i] = ["AUTO dari Drive: " + picked.file.name];
          backgrounds[i] = ["#d9ead3"];
          totals.autoExact++;
          logRows.push([name, rowNo, cellText, "AUTO", picked.file.name]);
        } else {
          notes[i] = ["AUTO (" + picked.level + " -> " + picked.file.name + ") - mohon cek sebentar"];
          backgrounds[i] = ["#fff2cc"];
          totals.autoMirip++;
          logRows.push([name, rowNo, cellText, "AUTO MIRIP", picked.file.name]);
        }
      } else {
        totals.review++;
        backgrounds[i] = ["#ffff00"];
        if (picked.reason === "multi") {
          notes[i] = ["CEK MANUAL: " + picked.count + " file cocok -> " + picked.names.slice(0, 5).join(" | ") + (picked.count > 5 ? " ..." : "")];
          logRows.push([name, rowNo, cellText, "REVIEW", picked.count + " file cocok"]);
        } else {
          var saran = (INDEX) ? suggestCandidates(INDEX, cellText, 5) : [];
          var bagSaran = saran.length ? " Kandidat terdekat: " + saran.join(" | ") : " Tidak ada kandidat mirip pun di " + (INDEX ? INDEX.length + " file index" : "Drive pribadi") + ".";
          notes[i] = ["CEK MANUAL: 0 file cocok \"" + cellText + "\"." + bagSaran + " Kalau file ada di akun Drive lain, share foldernya ke akun script lalu Run ulang."];
          logRows.push([name, rowNo, cellText, "REVIEW", "0 file" + (saran.length ? " (saran: " + saran.slice(0, 2).join(" | ") + ")" : "")]);
        }
      }
    }

    urlRange.setValues(newUrls);
    urlRange.setNotes(notes);
    for (var k = 0; k < backgrounds.length; k++) {
      if (backgrounds[k][0]) {
        sheet.getRange(headerRow + 1 + k, urlCol).setBackground(backgrounds[k][0]);
      }
    }

    if (totals.rows > 0) Logger.log("OK: " + name + " -> diproses " + totals.rows + " baris");
  });

  // ---- Sheet LOG ----
  var logSheet = null;
  var allSheets = ss.getSheets();
  for (var s = 0; s < allSheets.length; s++) {
    if (/^link resolution log$/i.test(allSheets[s].getName())) { logSheet = allSheets[s]; break; }
  }
  if (!logSheet) logSheet = ss.insertSheet("Link Resolution Log");
  logSheet.clear();

  logSheet.getRange(1, 1, 1, 2).setValues([["RINGKASAN - SMART v2.4", ""]]).setFontWeight("bold");
  logSheet.getRange(2, 1, 7, 2).setValues([
    ["Mode", INDEX ? "INDEX MULTI-SUMBER (dialek " + DRIVE_DIALECT + ")" : "DriveApp fallback"],
    ["Total file di index (unik)", INDEX ? INDEX.length : 0],
    ["Baris diproses", totals.rows],
    ["Auto persis (hijau)", totals.autoExact],
    ["Auto mirip (kuning muda)", totals.autoMirip],
    ["Perlu review (kuning)", totals.review],
    ["Dilewati / sudah URL", totals.skipped],
  ]);

  var startSources = 10;
  logSheet.getRange(startSources, 1, 1, 2).setValues([["SUMBER INDEX", "Jumlah file"]]).setFontWeight("bold");
  if (SOURCES.length) {
    logSheet.getRange(startSources + 1, 1, SOURCES.length, 2).setValues(SOURCES);
  }

  var startDetail = startSources + Math.max(SOURCES.length, 1) + 2;
  logSheet.getRange(startDetail, 1, 1, 5).setValues([["Tab", "Baris", "Nama File di Cell", "Status", "Keterangan"]]).setFontWeight("bold");
  if (logRows.length > 1) {
    logSheet.getRange(startDetail + 1, 1, logRows.length - 1, 5).setValues(logRows.slice(1));
  }

  // Sample nama file -> kolom H
  if (INDEX) {
    var sample = [["INDEX SAMPLE (" + Math.min(SAMPLE_SIZE, INDEX.length) + " dari " + INDEX.length + ")"]];
    for (var x = 0; x < Math.min(SAMPLE_SIZE, INDEX.length); x++) sample.push([INDEX[x].name]);
    logSheet.getRange(1, 8, sample.length, 1).setValues(sample);
    logSheet.getRange(1, 8).setFontWeight("bold");
    logSheet.setColumnWidth(8, 360);
  }

  logSheet.setColumnWidth(1, 200);
  logSheet.setColumnWidth(3, 260);
  logSheet.setColumnWidth(5, 420);
  logSheet.setFrozenRows(1);

  Logger.log("SELESAI. Diproses: " + totals.rows +
    " | AUTO persis: " + totals.autoExact +
    " | AUTO mirip: " + totals.autoMirip +
    " | REVIEW: " + totals.review +
    " | Skip: " + totals.skipped +
    " | Index: " + (INDEX ? INDEX.length : 0) + " file / " + SOURCES.length + " sumber" +
    " | Dialek: " + (DRIVE_DIALECT || "-"));
  Logger.log(">>> Cek sheet 'Link Resolution Log' -> SUMBER INDEX & INDEX SAMPLE. <<<");
}

/* ============================ HELPERS ==================================== */

function hasAdvancedDrive() {
  return (typeof Drive !== "undefined") && Drive && Drive.Files;
}

var DRIVE_DIALECT = null; // "v2" | "v3"

/** Satu halaman daftar file; teamDriveId null + query null = My Drive semua */
function indexPage(token, teamDriveId, query) {
  var params = {
    q: query || "trashed = false",
    pageToken: token || null,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  };
  if (teamDriveId) {
    if (DRIVE_DIALECT === "v2") { params.corpora = "teamDrive"; params.teamDriveId = teamDriveId; }
    else { params.corpora = "drive"; params.driveId = teamDriveId; }
  }
  if (DRIVE_DIALECT === "v2") {
    params.maxResults = 1000;
    params.fields = "nextPageToken,items(id,title,mimeType)";
  } else {
    params.pageSize = 1000;
    params.fields = "nextPageToken,files(id,name,mimeType)";
  }
  return Drive.Files.list(params);
}

function absorb(resp, index) {
  var arr = (DRIVE_DIALECT === "v2") ? (resp.items || []) : (resp.files || []);
  for (var i = 0; i < arr.length; i++) {
    if (index.length >= MAX_INDEX) break;
    var nm = (DRIVE_DIALECT === "v2") ? arr[i].title : arr[i].name;
    if (!nm) continue;
    index.push({
      id: arr[i].id,
      name: nm,
      lower: String(nm).toLowerCase(),
      norm: normBase(nm),
      isFolder: arr[i].mimeType === "application/vnd.google-apps.folder"
    });
  }
}

function paginateDrive(firstResp, index, teamDriveId, label, query) {
  var token = (firstResp && firstResp.nextPageToken) || null;
  var guard = 0;
  while (token && index.length < MAX_INDEX && guard < 80) {
    guard++;
    var r = indexPage(token, teamDriveId, query);
    absorb(r, index);
    token = r.nextPageToken || null;
  }
  if (guard >= 80) Logger.log("⚠ " + label + ": paginasi berhenti di guard 80 halaman");
}

/** Index: My Drive + Shared with me + SEMUA Shared Drive, lalu dedup by id */
function buildIndex(SOURCES) {
  var index = [];

  // deteksi dialek
  DRIVE_DIALECT = "v2";
  var first = null;
  try {
    first = indexPage(null, null, null);
  } catch (e) {
    if (!/invalid query/i.test(String(e && e.message || e))) throw e;
    DRIVE_DIALECT = "v3";
    first = indexPage(null, null, null);
  }

  // 1) My Drive (milik akun script)
  var before = index.length;
  absorb(first, index);
  paginateDrive(first, index, null, "My Drive", null);
  SOURCES.push(["My Drive (pribadi)", index.length - before]);
  Logger.log("Index My Drive: " + (index.length - before) + " file");

  // 2) Shared with me (milik rekan, di-share ke akun script) -- BARU di v2.4
  try {
    var swmQ = "trashed = false and sharedWithMe = true";
    var swm = indexPage(null, null, swmQ);
    var b4s = index.length;
    absorb(swm, index);
    paginateDrive(swm, index, null, "Shared with me", swmQ);
    SOURCES.push(["Shared with me (milik rekan)", index.length - b4s]);
    Logger.log("Index Shared with me: " + (index.length - b4s) + " file");
  } catch (swme) {
    SOURCES.push(["Shared with me (milik rekan)", "GAGAL: " + swme]);
    Logger.log("⚠ Gagal index sharedWithMe: " + swme);
  }

  // 3) Semua Shared Drive via Drives.list
  var dToken = null, dGuard = 0;
  do {
    var dparams = (DRIVE_DIALECT === "v2") ? { maxResults: 100 } : { pageSize: 100 };
    if (dToken) dparams.pageToken = dToken;
    var dresp;
    try {
      dresp = Drive.Drives.list(dparams);
    } catch (de) {
      Logger.log("⚠ Drives.list gagal: " + de);
      break;
    }
    var darr = (DRIVE_DIALECT === "v2") ? (dresp.items || []) : (dresp.drives || []);
    for (var d = 0; d < darr.length; d++) {
      if (index.length >= MAX_INDEX) break;
      var did = darr[d].id, dname = darr[d].name || did;
      var b4 = index.length;
      try {
        var fr = indexPage(null, did, null);
        absorb(fr, index);
        paginateDrive(fr, index, did, dname, null);
        SOURCES.push(["Shared Drive: " + dname, index.length - b4]);
        Logger.log("Index Shared Drive \"" + dname + "\": " + (index.length - b4) + " file");
      } catch (err) {
        SOURCES.push(["Shared Drive: " + dname, "GAGAL: " + err]);
        Logger.log("⚠ Gagal index \"" + dname + "\": " + err);
      }
    }
    dToken = dresp.nextPageToken || null;
    dGuard++;
  } while (dToken && dGuard < 10 && index.length < MAX_INDEX);

  // Dedup antar sumber (file sama bisa muncul di >1 corpus)
  var seenIds = {}, uniq = [];
  for (var z = 0; z < index.length; z++) {
    if (!seenIds[index[z].id]) { seenIds[index[z].id] = 1; uniq.push(index[z]); }
  }
  if (uniq.length !== index.length) Logger.log("Dedup antar sumber: " + index.length + " -> " + uniq.length + " file unik");
  return uniq;
}

function normBase(filename) {
  var s = String(filename || "").trim().toLowerCase();
  s = s.replace(/\.[a-z0-9]{2,5}$/, "");
  s = s.replace(/[^a-z0-9]/g, "");
  return s;
}

function urlFor(f) {
  return f.isFolder
    ? "https://drive.google.com/drive/folders/" + f.id
    : "https://drive.google.com/file/d/" + f.id + "/view";
}

/** exact -> norm -> fuzzy(prefix) -> contains (dua arah, min 4 char) */
function searchIndex(index, text) {
  var lower = String(text).toLowerCase();
  var target = normBase(text);
  var res = { exact: [], norm: [], fuzzy: [], contains: [] };

  for (var i = 0; i < index.length; i++) {
    var f = index[i];
    if (f.lower === lower) { res.exact.push(f); continue; }
    if (target.length >= 2) {
      if (f.norm === target) { res.norm.push(f); continue; }
      if (f.norm.indexOf(target) === 0) { res.fuzzy.push(f); continue; }
    }
    if (target.length >= 4 && f.norm.length >= 4 &&
        (f.norm.indexOf(target) >= 0 || target.indexOf(f.norm) >= 0)) {
      res.contains.push(f);
    }
  }
  return res;
}

function searchBasic(text) {
  var EXT = [".mp4", ".mov", ".jpg", ".jpeg", ".png", ".webp"];
  var res = { exact: [], norm: [], fuzzy: [], contains: [] };
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

function dedupById(files) {
  var seen = {}, out = [];
  files.forEach(function (f) {
    if (!seen[f.id]) { seen[f.id] = 1; out.push(f); }
  });
  return out;
}

function pickUnique(res) {
  var levels = [
    { level: "exact", files: dedupById(res.exact || []) },
    { level: "norm", files: dedupById(res.norm || []) },
    { level: "fuzzy", files: dedupById(res.fuzzy || []) },
    { level: "contains", files: dedupById(res.contains || []) }
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

/** Untuk baris 0-match: cari nama file yang paling mirip (token overlap) */
function suggestCandidates(index, text, max) {
  var target = normBase(text);
  if (target.length < 4) return [];
  var tokens = String(text).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  var scored = [];
  for (var i = 0; i < index.length; i++) {
    var f = index[i];
    var score = 0;
    if (f.norm.indexOf(target) >= 0 || target.indexOf(f.norm) >= 0) score += 2;
    for (var t = 0; t < tokens.length; t++) {
      if (f.lower.indexOf(tokens[t]) >= 0) score++;
    }
    if (score > 0) scored.push({ name: f.name, score: score });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  var out = [];
  for (var s2 = 0; s2 < scored.length && s2 < (max || 5); s2++) out.push(scored[s2].name);
  return out;
}