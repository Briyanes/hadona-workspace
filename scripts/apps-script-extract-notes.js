/**
 * ============================================================================
 * CARA PAKAI (sekali jalan, di SHEET ASLI — bukan link publish):
 * ============================================================================
 * 1. Buka spreadsheet Google Sheets ASLI (yang punya cell notes "Copy di Note").
 * 2. Menu: Extensions → Apps Script.
 * 3. Hapus isi Code.gs default, paste SEMUA kode di file ini.
 * 4. Klik ikon 💾 Save, lalu pilih fungsi `extractNotesToColumns` di dropdown
 *    atas, klik **Run**.
 * 5. Saat pertama kali diminta permission, klik
 *    "Review permissions" → pilih akun → "Advanced" → "Go to ... (unsafe)"
 *    → Allow. (Script hanya menulis ke spreadsheet Anda sendiri.)
 * 6. Tunggu sampai muncul log "SELESAI". Cek sheet: akan muncul 3 kolom baru
 *    di paling kanan → "Caption (Copy)", "Prefilled (Copy)",
 *    "Content Link (URL)" ← URL asli dari hyperlink tertanam.
 * 7. TERAKHIR & PENTING: File → Share → Publish to web → **Publish ulang**
 *    (re-publish) supaya link publish ikut memuat kolom baru.
 *
 * Catatan versi 2:
 * - Kolom "Content Link (URL)" mengekstrak URL hyperlink tertanam via
 *   getRichTextValues() — CSV publish biasanya hanya memuat teks tampilan
 *   (mis. "Link", "Drive"), bukan URL-nya.
 * - Notes pada kolom Content Link juga dibaca (jika tim menaruh link di note).
 * ============================================================================
 */

function extractNotesToColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  let totalNotes = 0;
  let totalLinks = 0;

  sheets.forEach(function (sheet) {
    const name = sheet.getName();
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      Logger.log("SKIP (kosong): " + name);
      return;
    }

    // Cari baris header: baris pertama yang mengandung kata "Caption"
    const headerRange = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 10), lastCol);
    const headerVals = headerRange.getValues();
    let headerRow = -1;
    let capCol = -1;
    let preCol = -1;
    let linkCol = -1;
    for (let r = 0; r < headerVals.length; r++) {
      for (let c = 0; c < headerVals[r].length; c++) {
        const h = String(headerVals[r][c] || "").trim();
        if (/^caption$/i.test(h)) { headerRow = r + 1; capCol = c + 1; }
        if (/prefilled\s*message/i.test(h)) { preCol = c + 1; }
        if (/^content\s*link$/i.test(h)) { linkCol = c + 1; }
      }
      if (capCol > 0 && preCol > 0) break;
    }

    if (capCol < 0 || preCol < 0) {
      Logger.log("SKIP (tidak ada kolom Caption/Prefilled): " + name);
      return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) {
      Logger.log("SKIP (tanpa data): " + name);
      return;
    }

    const dataRows = lastRow - headerRow;

    // Ambil notes untuk Caption & Prefilled
    const capNotes = sheet.getRange(headerRow + 1, capCol, dataRows, 1).getNotes();
    const preNotes = sheet.getRange(headerRow + 1, preCol, dataRows, 1).getNotes();

    // Ambil URL hyperlink dari Content Link (rich text) + notes-nya
    let linkUrls = null;
    let linkNotes = null;
    if (linkCol > 0) {
      const rich = sheet.getRange(headerRow + 1, linkCol, dataRows, 1).getRichTextValues();
      linkNotes = sheet.getRange(headerRow + 1, linkCol, dataRows, 1).getNotes();
      linkUrls = rich.map(function (row) {
        const rt = row[0];
        if (!rt) return [""];
        // URL cell-level (insert link pada cell)
        const runs = rt.getRuns();
        const urls = [];
        for (var i = 0; i < runs.length; i++) {
          var u = runs[i].getLinkUrl();
          if (u && urls.indexOf(u) === -1) urls.push(u);
        }
        if (!urls.length) {
          var cl = rt.getLinkUrl(); // link level-cell
          if (cl) urls.push(cl);
        }
        return [urls.join(" ")];
      });
    }

    // Siapkan kolom output: 3 kolom baru setelah kolom terakhir
    let outCapCol = lastCol + 1;
    let outPreCol = lastCol + 2;
    let outLinkCol = lastCol + 3;

    // Jika sudah pernah dijalankan (header output sudah ada), pakai kolom itu
    const scanCols = Math.max(lastCol + 4, sheet.getLastColumn());
    const existingHeaders = sheet.getRange(headerRow, 1, 1, scanCols).getValues()[0];
    for (let c = 0; c < existingHeaders.length; c++) {
      const h = String(existingHeaders[c] || "").trim();
      if (/caption\s*\(copy\)/i.test(h)) outCapCol = c + 1;
      if (/prefilled\s*\(copy\)/i.test(h)) outPreCol = c + 1;
      if (/content\s*link\s*\(url\)/i.test(h)) outLinkCol = c + 1;
    }

    // Tulis header + isi
    sheet.getRange(headerRow, outCapCol).setValue("Caption (Copy)");
    sheet.getRange(headerRow, outPreCol).setValue("Prefilled (Copy)");
    sheet.getRange(headerRow, outLinkCol).setValue("Content Link (URL)");

    const capOut = [];
    const preOut = [];
    const linkOut = [];
    let count = 0;
    let linkCount = 0;
    for (let i = 0; i < dataRows; i++) {
      const cn = String(capNotes[i][0] || "").trim();
      const pn = String(preNotes[i][0] || "").trim();
      capOut.push([cn]);
      preOut.push([pn]);

      // URL hyperlink; fallback: URL di dalam note Content Link
      let lu = linkUrls ? String(linkUrls[i][0] || "").trim() : "";
      if (!lu && linkNotes) {
        const noteTxt = String(linkNotes[i][0] || "").trim();
        const m = noteTxt.match(/https?:\/\/\S+/i);
        if (m) lu = m[0];
      }
      linkOut.push([lu]);

      if (cn || pn) count++;
      if (lu) linkCount++;
    }

    sheet
      .getRange(headerRow + 1, outCapCol, capOut.length, 1)
      .setValues(capOut);
    sheet
      .getRange(headerRow + 1, outPreCol, preOut.length, 1)
      .setValues(preOut);
    sheet
      .getRange(headerRow + 1, outLinkCol, linkOut.length, 1)
      .setValues(linkOut);

    totalNotes += count;
    totalLinks += linkCount;
    Logger.log(
      "OK: " + name + " → " + count + " baris note, " + linkCount + " URL link " +
      "(kolom out: " + outCapCol + ", " + outPreCol + ", " + outLinkCol + ")"
    );
  });

  Logger.log("SELESAI. Total baris dengan note: " + totalNotes + " | Total URL link terekstrak: " + totalLinks);
  Logger.log(">>> JANGAN LUPA: File → Share → Publish to web → Publish ulang <<<");
}