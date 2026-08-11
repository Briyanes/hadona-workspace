import fs from "fs";

const html = fs.readFileSync("/tmp/sheet-pubhtml.html", "utf-8");

// Extract title
const titleMatch = html.match(/<title>([^<]+)<\/title>/);
console.log("📋 TITLE:", titleMatch ? titleMatch[1] : "N/A");

// Google Sheets pubhtml format:
// Each sheet is in a <div id="sheet-json-XXX"> or has class "sheet-name"
// The actual content is in <table> elements

// Find all sheet names - Google Sheets pubhtml puts them in <div class="sheet-name">
const sheetNameRegex = /<div[^>]*class="sheet-name"[^>]*>([^<]+)<\/div>/g;
let sheetNames = [];
let m;
while ((m = sheetNameRegex.exec(html)) !== null) {
  sheetNames.push(m[1].trim());
}

// Also try: id="sheet-tabs" containing <li> elements
if (sheetNames.length === 0) {
  const tabsRegex = /id="sheet-tabs"[\s\S]*?<\/ul>/;
  const tabsMatch = html.match(tabsRegex);
  if (tabsMatch) {
    const liRegex = /<li[^>]*>([^<]+)<\/li>/g;
    while ((m = liRegex.exec(tabsMatch[0])) !== null) {
      sheetNames.push(m[1].trim());
    }
  }
}

// Try: "switchSheet('name')" pattern
if (sheetNames.length === 0) {
  const switchRegex = /switchSheet\(['"]([^'"]+)['"]\)/g;
  while ((m = switchRegex.exec(html)) !== null) {
    sheetNames.push(m[1]);
  }
}

// Try: sheet-name in span or div
if (sheetNames.length === 0) {
  const spanRegex = /<(?:span|div)[^>]*>([^<]{1,50})<\/(?:span|div)>/g;
  const candidates = [];
  while ((m = spanRegex.exec(html)) !== null) {
    candidates.push(m[1].trim());
  }
  // Filter likely sheet names
  sheetNames = candidates.filter(c => 
    c && !c.includes("http") && !c.includes("function") && 
    c.length > 2 && c.length < 50
  );
}

console.log(`\n📑 Sheet names found: ${sheetNames.length}`);
sheetNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));

// Now extract tables
// Google pubhtml uses <table> with <tbody><tr><td>
// Each sheet has its own table

// Split HTML by sheet markers if available
// The pubhtml structure: <div id="0" ...> contains the first sheet's table
// <div id="1" ...> contains the second, etc.

// Alternative: just extract all tables
const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/g;
let tableMatch;
let tableIndex = 0;

while ((tableMatch = tableRegex.exec(html)) !== null) {
  tableIndex++;
  const tableHtml = tableMatch[1];
  
  console.log(`\n${"=".repeat(70)}`);
  const sheetLabel = sheetNames[tableIndex - 1] || `Table ${tableIndex}`;
  console.log(`📊 SHEET/TABLE ${tableIndex}: ${sheetLabel}`);
  console.log("=".repeat(70));
  
  // Extract rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rowMatch;
  let rowCount = 0;
  
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    // Extract cell content from <td> or <th>
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let cellMatch;
    const cells = [];
    
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      // Clean HTML entities and tags from cell content
      let text = cellMatch[1]
        .replace(/<[^>]+>/g, "") // Remove inner tags
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
        .trim();
      cells.push(text);
    }
    
    if (cells.length > 0 && cells.some(c => c !== "")) {
      rowCount++;
      if (rowCount <= 50) {
        // Only show first 20 columns
        const display = cells.slice(0, 20);
        console.log(`   [${rowCount}] ${JSON.stringify(display)}`);
      } else if (rowCount === 51) {
        console.log(`   ... (more rows exist)`);
      }
    }
  }
  console.log(`   Total data rows: ${rowCount}`);
}

if (tableIndex === 0) {
  console.log("\n❌ No tables found in HTML!");
  console.log("First 2000 chars of HTML:");
  console.log(html.substring(0, 2000));
}