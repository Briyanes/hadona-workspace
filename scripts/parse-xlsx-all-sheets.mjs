import fs from "fs";
import path from "path";

const XLSX_DIR = "/tmp/xlsx_extract";

// ── 1. Parse workbook.xml for sheet names ──
const workbookXml = fs.readFileSync(path.join(XLSX_DIR, "xl/workbook.xml"), "utf-8");
const sheetRegex = /<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*(?:r:id="([^"]+)")?[^>]*\/?>/g;
const sheets = [];
let m;
while ((m = sheetRegex.exec(workbookXml)) !== null) {
  sheets.push({ name: m[1], sheetId: m[2], rId: m[3] });
}
console.log(`📋 WORKBOOK: ${sheets.length} sheets found\n`);
sheets.forEach((s, i) => console.log(`   ${i + 1}. ${s.name} (sheetId: ${s.sheetId})`));

// ── 2. Parse sharedStrings.xml ──
const ssXml = fs.readFileSync(path.join(XLSX_DIR, "xl/sharedStrings.xml"), "utf-8");
const sharedStrings = [];
// Each <si>...</si> is one shared string entry
const siRegex = /<si>([\s\S]*?)<\/si>/g;
while ((m = siRegex.exec(ssXml)) !== null) {
  const siContent = m[1];
  // Extract all <t>...</t> text within this <si> (handles rich text <r><t>)
  const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let tm;
  let text = "";
  while ((tm = tRegex.exec(siContent)) !== null) {
    text += tm[1];
  }
  // Decode XML entities
  text = text
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  sharedStrings.push(text);
}
console.log(`\n📝 Shared strings: ${sharedStrings.length}\n`);

// ── 3. Parse each sheet ──
for (let i = 0; i < sheets.length; i++) {
  const sheetFileName = `sheet${i + 1}.xml`;
  const sheetPath = path.join(XLSX_DIR, "xl/worksheets", sheetFileName);
  
  if (!fs.existsSync(sheetPath)) {
    console.log(`\n⚠️  Sheet file not found: ${sheetPath}`);
    continue;
  }
  
  const sheetXml = fs.readFileSync(sheetPath, "utf-8");
  const sheetName = sheets[i].name;
  
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 SHEET ${i + 1}: "${sheetName}"`);
  console.log("═".repeat(70));
  
  // Parse rows
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  let rowCount = 0;
  
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rm[1];
    // Parse cells: <c r="A1" t="s"><v>0</v></c>  or  <c r="A1"><v>123</v></c>
    const cellRegex = /<c\s+r="([A-Z]+\d+)"(?:[^>]*?t="([^"]+)")?[^>]*>(?:<v>([^<]*)<\/v>)?[^<]*<\/c>/g;
    let cm;
    const cells = {};
    let maxCol = 0;
    
    while ((cm = cellRegex.exec(rowContent)) !== null) {
      const ref = cm[1]; // e.g., "A1", "B5"
      const type = cm[2]; // "s" = shared string, undefined = number, "str" = formula string, "inlineStr" = inline
      const value = cm[3]; // raw value
      
      // Extract column letter and row number
      const colMatch = ref.match(/([A-Z]+)(\d+)/);
      if (!colMatch) continue;
      const colLetters = colMatch[1];
      const rowNum = parseInt(colMatch[2]);
      
      // Convert column letters to index (A=0, B=1, ..., Z=25, AA=26, ...)
      let colIdx = 0;
      for (const ch of colLetters) {
        colIdx = colIdx * 26 + (ch.charCodeAt(0) - 64);
      }
      colIdx -= 1; // 0-based
      
      let displayValue = "";
      if (value === undefined || value === "") {
        displayValue = "";
      } else if (type === "s") {
        // Shared string reference
        displayValue = sharedStrings[parseInt(value)] || "";
      } else {
        displayValue = value;
      }
      
      cells[colIdx] = displayValue;
      if (colIdx > maxCol) maxCol = colIdx;
    }
    
    // Check if row has any data
    const hasData = Object.values(cells).some(v => v !== "" && v !== undefined);
    if (hasData) {
      rowCount++;
      // Build array representation
      const rowArray = [];
      for (let c = 0; c <= Math.min(maxCol, 25); c++) {
        rowArray.push(cells[c] || "");
      }
      
      if (rowCount <= 40) {
        // Truncate long values for display
        const display = rowArray.map(v => {
          if (v.length > 60) return v.substring(0, 57) + "...";
          return v;
        });
        console.log(`   [${rowCount}] ${JSON.stringify(display)}`);
      } else if (rowCount === 41) {
        console.log(`   ... (more rows exist, showing first 40 only)`);
      }
    }
  }
  console.log(`   📁 Total data rows: ${rowCount}`);
}