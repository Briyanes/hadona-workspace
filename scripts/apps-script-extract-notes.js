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
 * 6. Tunggu sampai muncul log "SELESAI". Cek sheet: akan muncul 2 kolom baru
 *    di paling kanan → "Caption (Copy)" dan "Prefilled (Copy)".
 * 7. TERAKHIR & PENTING: File → Share → Publish to web → **Publish ulang**
 *    (re-publish) supaya link publish ikut memuat kolom baru.
 * ============================================================================
 */

function extractNotesToColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const HEADER_HINT = /caption/i;
  let totalNotes = 0;

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
    for (let r = 0; r < headerVals.length; r++) {
      for (let c = 0; c < headerVals[r].length; c++) {
        const h = String(headerVals[r][c] || "").trim();
        if (/^caption$/i.test(h)) { headerRow = r + 1; capCol = c + 1; }
        if (/prefilled\s*message/i.test(h)) { preCol = c + 1; }
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

    // Ambil notes untuk kedua kolom
    const capNotes = sheet.getRange(headerRow + 1, capCol, lastRow - headerRow, 1).getNotes();
    const preNotes = sheet.getRange(headerRow + 1, preCol, lastRow - headerRow, 1).getNotes();

    // Siapkan kolom output: 2 kolom baru setelah kolom terakhir
    let outCapCol = lastCol + 1;
    let outPreCol = lastCol + 2;

    // Jika sudah pernah dijalankan (header output sudah ada), pakai kolom itu
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(lastCol + 4, lastCol)).getValues()[0];
    for (let c = 0; c < existingHeaders.length; c++) {
      const h = String(existingHeaders[c] || "").trim();
      if (/caption\s*\(copy\)/i.test(h)) outCapCol = c + 1;
      if (/prefilled\s*\(copy\)/i.test(h)) outPreCol = c + 1;
    }

    // Tulis header + isi
    sheet.getRange(headerRow, outCapCol).setValue("Caption (Copy)");
    sheet.getRange(headerRow, outPreCol).setValue("Prefilled (Copy)");

    const capOut = [];
    const preOut = [];
    let count = 0;
    for (let i = 0; i < capNotes.length; i++) {
      const cn = String(capNotes[i][0] || "").trim();
      const pn = String(preNotes[i][0] || "").trim();
      capOut.push([cn]);
      preOut.push([pn]);
      if (cn || pn) count++;
    }

    sheet
      .getRange(headerRow + 1, outCapCol, capOut.length, 1)
      .setValues(capOut);
    sheet
      .getRange(headerRow + 1, outPreCol, preOut.length, 1)
      .setValues(preOut);

    totalNotes += count;
    Logger.log("OK: " + name + " → " + count + " baris dengan note (kolom out: " + outCapCol + ", " + outPreCol + ")");
  });

  Logger.log("SELESAI. Total baris dengan note: " + totalNotes);
  Logger.log(">>> JANGAN LUPA: File → Share → Publish to web → Publish ulang <<<");
}