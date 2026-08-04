/**
 * Test script untuk verify acronym matching logic (YBD <-> Your Best Deal)
 * Run: node scripts/test-acronym-match.mjs
 *
 * Test scenario:
 *   1. Sheet "YBD" → DB "Your Best Deal" → MUST MATCH (conf >= 0.9)
 *   2. Sheet "NC" → DB "NOUBAN CPAS" → MUST MATCH (conf >= 0.9)
 *   3. Sheet "Your Best Deal" → DB "YBD" → MUST MATCH (conf >= 0.9)
 *   4. Sheet "NOUBAN CPAS" → DB "NOUBAN CPAS" → MUST MATCH exact (conf = 1)
 *   5. Sheet "Haena Kontruksi" → DB "Haena Konstruksi" → MUST MATCH (substring, conf >= 0.9)
 */

// Replicate computeAcronym from sheet-parser.ts
function computeAcronym(normalizedName) {
  const STOPWORDS = new Set(["of", "the", "and", "or", "di", "dan", "atau", "untuk", "for", "to", "in", "on"]);
  const words = normalizedName.split(" ").filter((w) => w.length > 0 && !STOPWORDS.has(w));
  if (words.length < 2) return "";
  return words.map((w) => w[0]).join("");
}

// Replicate matchClientFuzzy from sheet-parser.ts
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function matchClientFuzzy(sheetName, dbClients) {
  if (!sheetName) return null;
  const target = normalize(sheetName);
  if (!target) return null;

  const targetAcronym = computeAcronym(target);
  const targetUpper = target.replace(/\s/g, "");
  const targetWords = target.split(" ");
  const targetIsAcronym =
    targetWords.length === 1 && target.length >= 2 && target.length <= 6;

  let best = null;

  for (const c of dbClients) {
    const candidate = normalize(c.name);
    if (!candidate) continue;

    if (candidate === target) {
      return { id: c.id, name: c.name, confidence: 1 };
    }

    const candidateAcronym = computeAcronym(candidate);
    const candidateUpper = candidate.replace(/\s/g, "");
    const candidateWords = candidate.split(" ");
    const candidateIsAcronym =
      candidateWords.length === 1 && candidate.length >= 2 && candidate.length <= 6;

    if (targetIsAcronym && candidateAcronym && target === candidateAcronym) {
      return { id: c.id, name: c.name, confidence: 0.95 };
    }
    if (candidateIsAcronym && targetAcronym && candidate === targetAcronym) {
      return { id: c.id, name: c.name, confidence: 0.95 };
    }

    if (targetAcronym && candidateAcronym && targetAcronym === candidateAcronym && targetAcronym.length >= 2) {
      const conf = 0.9;
      if (!best || conf > best.confidence) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
      continue;
    }

    if (targetAcronym && targetAcronym === candidateUpper && targetAcronym.length >= 2) {
      const conf = 0.92;
      if (!best || conf > best.confidence) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
      continue;
    }
    if (candidateAcronym && candidateAcronym === targetUpper && candidateAcronym.length >= 2) {
      const conf = 0.92;
      if (!best || conf > best.confidence) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
      continue;
    }

    if (candidate.includes(target) || target.includes(candidate)) {
      const conf = Math.min(candidate.length, target.length) / Math.max(candidate.length, target.length);
      if (!best || conf > best.confidence) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
      continue;
    }

    const wordsAArr = candidate.split(" ");
    const wordsBArr = target.split(" ");
    const wordsBSet = new Set(wordsBArr);
    const intersection = wordsAArr.filter((w) => wordsBSet.has(w) && w.length > 2).length;
    const union = new Set(wordsAArr.concat(wordsBArr)).size;
    if (intersection > 0 && union > 0) {
      const conf = intersection / union;
      if (conf >= 0.4 && (!best || conf > best.confidence)) {
        best = { id: c.id, name: c.name, confidence: conf };
      }
    }
  }

  return best;
}

// ============================================================================
// TEST SUITE
// ============================================================================

const dbClients = [
  { id: "1", name: "Your Best Deal" },
  { id: "2", name: "NOUBAN CPAS" },
  { id: "3", name: "Haena Konstruksi" },
  { id: "4", name: "NOUBAN" },
  { id: "5", name: "Tombo Ati" },
  { id: "6", name: "Bolu Kukis" },
  { id: "7", name: "OCEAN Travel" },
  { id: "8", name: "NC" }, // pure acronym test
];

const tests = [
  { sheet: "YBD", expected: "Your Best Deal", minConf: 0.9 },
  { sheet: "ybd", expected: "Your Best Deal", minConf: 0.9 },
  { sheet: "Ybd", expected: "Your Best Deal", minConf: 0.9 },
  { sheet: "Your Best Deal", expected: "Your Best Deal", minConf: 1.0 },
  { sheet: "NC", expected: "NOUBAN CPAS", minConf: 0.9 }, // single-token acronym vs multi-word
  { sheet: "NOUBAN CPAS", expected: "NOUBAN CPAS", minConf: 1.0 },
  { sheet: "Haena Kontruksi", expected: "Haena Konstruksi", minConf: 0.85 }, // typo
  { sheet: "Haena Konstruksi", expected: "Haena Konstruksi", minConf: 1.0 },
  { sheet: "NOUBAN", expected: "NOUBAN", minConf: 1.0 },
  { sheet: "Tombo Ati", expected: "Tombo Ati", minConf: 1.0 },
  { sheet: "OCEAN Travel", expected: "OCEAN Travel", minConf: 1.0 },
  { sheet: "Bolu Kukis", expected: "Bolu Kukis", minConf: 1.0 },
];

console.log("🧪 Test Acronym Matching Logic\n");
console.log("=" .repeat(70));

let pass = 0;
let fail = 0;

for (const test of tests) {
  const result = matchClientFuzzy(test.sheet, dbClients);
  const ok = result && result.name === test.expected && result.confidence >= test.minConf;
  const status = ok ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} | "${test.sheet}"`);
  console.log(`         expected: "${test.expected}" (conf >= ${test.minConf})`);
  console.log(`         got:      ${result ? `"${result.name}" (conf ${result.confidence.toFixed(2)})` : "NULL"}`);
  if (ok) pass++;
  else fail++;
  console.log("-" .repeat(70));
}

console.log(`\n📊 Result: ${pass} passed, ${fail} failed (${tests.length} total)`);
process.exit(fail > 0 ? 1 : 0);