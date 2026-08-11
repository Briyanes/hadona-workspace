#!/usr/bin/env node
/**
 * Download dan baca semua sheet dari Google Spreadsheet yang dipublikasikan
 */
const BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy/pub';

const GIDS = [
  805492457,
  1731963602,
  1234867213,
  510917896,
  968166183,
  589440544,
  239752135,
];

async function fetchSheet(gid) {
  const url = `${BASE_URL}?output=csv&gid=${gid}&single=true`;
  const res = await fetch(url);
  if (!res.ok) {
    return `[ERROR ${res.status}]`;
  }
  const text = await res.text();
  return text;
}

function parseCSV(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        current.push(field);
        field = '';
      } else if (char === '\n') {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      } else if (char === '\r') {
        // skip
      } else {
        field += char;
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 GOOGLE SPREADSHEET READER — ${GIDS.length} Sheets`);
  console.log(`${'='.repeat(80)}\n`);

  for (let idx = 0; idx < GIDS.length; idx++) {
    const gid = GIDS[idx];
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📄 SHEET ${idx + 1} (GID: ${gid})`);
    console.log(`${'─'.repeat(80)}`);

    try {
      const csv = await fetchSheet(gid);
      const rows = parseCSV(csv);
      const dataRows = rows.filter((r) => r.some((c) => c.trim() !== ''));
      console.log(`   Total rows: ${dataRows.length}`);

      if (dataRows.length === 0) {
        console.log('   (Empty sheet)');
        continue;
      }

      // Print header
      const header = dataRows[0];
      console.log(`   Columns (${header.length}): ${header.join(' | ')}`);
      console.log('');

      // Print first 15 data rows
      const maxShow = Math.min(dataRows.length, 16);
      for (let r = 1; r < maxShow; r++) {
        const row = dataRows[r];
        // Truncate each cell to 25 chars
        const display = row.map((c) => {
          const s = c.trim();
          return s.length > 30 ? s.substring(0, 27) + '...' : s;
        });
        console.log(`   [${r}] ${display.join(' | ')}`);
      }
      if (dataRows.length > 16) {
        console.log(`   ... ${dataRows.length - 16} more rows`);
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Done reading all sheets');
  console.log(`${'='.repeat(80)}\n`);
}

main().catch(console.error);