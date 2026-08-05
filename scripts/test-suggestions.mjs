/**
 * 🧪 Quick unit test untuk Sprint 4.9 P2: Auto-Suggest Client Match
 *
 * Test helper findClientSuggestions yang menggabungkan:
 * - Substring match (priority tinggi)
 * - Token overlap
 * - Levenshtein distance (typo tolerance)
 *
 * Run: `node scripts/test-suggestions.mjs`
 *
 * NOTE: Ini adalah port JS dari logika TypeScript di src/components/reports/import-sheet-modal.tsx.
 * Pastikan keduanya sync kalau ada perubahan algorithm.
 */

// =========================
// HELPERS (port dari TS)
// =========================

function normalizeName(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length > 30 || b.length > 30) return 99;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findClientSuggestions(unmatchedName, clients, limit = 3) {
  const target = normalizeName(unmatchedName);
  if (!target || target.length < 2) return [];

  const targetTokens = new Set(target.split(/\s+/).filter((t) => t.length >= 3));
  const scored = [];

  for (const client of clients) {
    const candidate = normalizeName(client.name);
    if (!candidate) continue;

    let score = 0;
    let reason = "";

    if (target === candidate) {
      score = 100;
      reason = "exact";
    } else if (target.length >= 4 && candidate.includes(target)) {
      score = 90;
      reason = "substring";
    } else if (candidate.length >= 4 && target.includes(candidate)) {
      score = 85;
      reason = "substring-rev";
    } else {
      const candidateTokens = new Set(candidate.split(/\s+/).filter((t) => t.length >= 3));
      let overlap = 0;
      for (const t of Array.from(targetTokens)) {
        if (candidateTokens.has(t)) overlap++;
      }
      if (overlap > 0) {
        score = 50 + overlap * 10;
        reason = `overlap:${overlap}`;
      }
    }

    if (score === 0) {
      const dist = levenshtein(target, candidate);
      const maxLen = Math.max(target.length, candidate.length);
      const similarity = maxLen > 0 ? 1 - dist / maxLen : 0;
      if (similarity >= 0.75 && dist <= 3) {
        score = Math.round(similarity * 60);
        reason = `typo:${dist}`;
      }
    }

    if (score > 0) {
      scored.push({ client, score, reason });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// =========================
// TEST SUITE
// =========================

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

// --- Test data: mock clients (mirip dengan clients DB Hadona) ---
const mockClients = [
  { id: "1", name: "Rmoda" },
  { id: "2", name: "Roda Sederhana" },
  { id: "3", name: "Sumber Rezeki" },
  { id: "4", name: "Dapur Kurma Indonesia" },
  { id: "5", name: "Kurma Premium" },
  { id: "6", name: "Toko Makmur Jaya" },
  { id: "7", name: "Berkah Jaya Abadi" },
  { id: "8", name: "PT Sumber Makmur" },
  { id: "9", name: "CV Berkah Sentosa" },
  { id: "10", name: "Hijab Salsabila" },
];

// --- TEST 1: Exact match (case-insensitive, whitespace-insensitive) ---
test("exact match case-insensitive", () => {
  const result = findClientSuggestions("RMODA", mockClients);
  assert(result.length > 0, "Should find at least 1");
  assert(result[0].client.id === "1", `Expected client 1, got ${result[0].client.id}`);
  assert(result[0].score === 100, `Expected score 100, got ${result[0].score}`);
  assert(result[0].reason === "exact", `Expected reason "exact", got ${result[0].reason}`);
});

// --- TEST 2: Exact match dengan extra whitespace ---
test("exact match with whitespace", () => {
  const result = findClientSuggestions("  Rmoda  ", mockClients);
  assert(result[0].client.id === "1", `Expected client 1`);
  assert(result[0].reason === "exact", "Should be exact match");
});

// --- TEST 3: Substring match (sheet "Rmoda" → client "Roda Sederhana" should NOT substring) ---
// "rmoda" vs "roda sederhana" → no substring. But "roda" (3 char) overlap? "roda" < 4 char rule for substring
test("substring: target contains candidate", () => {
  const clients = [
    { id: "x", name: "Kurma" }, // 5 char normalized
  ];
  const result = findClientSuggestions("Toko Kurma Premium", clients);
  assert(result.length > 0, "Should find via substring-rev");
  assert(result[0].reason === "substring-rev", `Expected substring-rev, got ${result[0].reason}`);
});

// --- TEST 4: Token overlap (multiple words matching) ---
test("token overlap: 'Sumber Rezeki' vs 'PT Sumber Makmur'", () => {
  const result = findClientSuggestions("Sumber Rezeki", mockClients);
  // Should rank "Sumber Rezeki" exact at #1, but also find "PT Sumber Makmur" via overlap
  assert(result.length >= 2, `Expected at least 2 results, got ${result.length}`);
  assert(result[0].client.id === "3", "Top match should be exact 'Sumber Rezeki'");
  // Find PT Sumber Makmur in results
  const ptSumber = result.find((r) => r.client.id === "8");
  assert(ptSumber, "Should also find 'PT Sumber Makmur' via overlap");
  assert(ptSumber.reason.startsWith("overlap"), `Expected overlap reason, got ${ptSumber.reason}`);
});

// --- TEST 5: Levenshtein typo tolerance (1-2 char diff) ---
test("levenshtein typo: 'Kurama' → 'Kurma'", () => {
  const clients = [{ id: "k1", name: "Kurma" }];
  const result = findClientSuggestions("Kurama", clients);
  assert(result.length > 0, "Should find via levenshtein");
  assert(result[0].client.name === "Kurma", "Should match Kurma");
  assert(result[0].reason.startsWith("typo"), `Expected typo reason, got ${result[0].reason}`);
});

// --- TEST 6: Limit parameter ---
test("limit parameter (top-3 only)", () => {
  const clients = [
    { id: "1", name: "Sumber A" },
    { id: "2", name: "Sumber B" },
    { id: "3", name: "Sumber C" },
    { id: "4", name: "Sumber D" },
    { id: "5", name: "Sumber E" },
  ];
  const result = findClientSuggestions("Sumber Test", clients, 3);
  assert(result.length === 3, `Expected 3 results, got ${result.length}`);
});

// --- TEST 7: No match (completely different) ---
test("no match returns empty", () => {
  const result = findClientSuggestions("XYZABC12345", mockClients);
  assert(result.length === 0, `Expected empty, got ${result.length}`);
});

// --- TEST 8: Empty/short input ---
test("empty input returns empty", () => {
  assert(findClientSuggestions("", mockClients).length === 0, "Empty should return []");
  assert(findClientSuggestions("A", mockClients).length === 0, "Single char should return []");
});

// --- TEST 9: Real-world case: "Berkah" → multiple matches ---
test("real-world: 'Berkah' matches multiple clients", () => {
  const result = findClientSuggestions("Berkah", mockClients);
  // Should find "Berkah Jaya Abadi" (substring-rev) and "CV Berkah Sentosa" (substring-rev)
  assert(result.length >= 2, `Expected at least 2 matches, got ${result.length}`);
  const ids = result.map((r) => r.client.id);
  assert(ids.includes("7"), "Should match Berkah Jaya Abadi");
  assert(ids.includes("9"), "Should match CV Berkah Sentosa");
});

// --- TEST 10: Score ordering (descending) ---
test("results sorted by score descending", () => {
  const result = findClientSuggestions("Sumber", mockClients);
  for (let i = 1; i < result.length; i++) {
    assert(
      result[i - 1].score >= result[i].score,
      `Scores not sorted: ${result[i - 1].score} < ${result[i].score}`
    );
  }
});

// --- TEST 11: Special characters normalized ---
// "PT. Berkah Jaya Abadi!!!" → "pt berkah jaya abadi" (target)
// Client "Berkah Jaya Abadi" → "berkah jaya abadi" (candidate)
// Target longer than candidate (ada prefix "pt"), jadi candidate adalah substring
// dari target → reason="substring-rev" (score 85). Ini behavior yang correct.
test("special chars normalized: prefix varian (PT/CV) detected", () => {
  const result = findClientSuggestions("PT. Berkah Jaya Abadi!!!", mockClients);
  assert(result.length > 0, "Should find via normalization");
  assert(result[0].client.id === "7", "Should match Berkah Jaya Abadi");
  assert(
    result[0].reason === "substring-rev",
    `Expected substring-rev (target has prefix), got ${result[0].reason}`
  );
  assert(result[0].score === 85, `Expected score 85, got ${result[0].score}`);
});

// --- TEST 11b: Pure exact setelah normalize (no prefix) ---
test("pure exact after normalize (no prefix)", () => {
  const result = findClientSuggestions("Berkah, Jaya, Abadi!", mockClients);
  assert(result[0].client.id === "7", "Should match Berkah Jaya Abadi");
  assert(result[0].reason === "exact", `Expected exact, got ${result[0].reason}`);
});

// --- TEST 12: Punctuation-heavy name ---
test("punctuation: 'Dapur Kurma Indonesia' vs 'Dapur-Kurma-Indonesia'", () => {
  const clients = [{ id: "1", name: "Dapur Kurma Indonesia" }];
  const result = findClientSuggestions("Dapur-Kurma-Indonesia", clients);
  assert(result.length > 0, "Should find");
  assert(result[0].reason === "exact", `Expected exact after normalize, got ${result[0].reason}`);
});

// =========================
// RUN TESTS
// =========================

console.log("🧪 Sprint 4.9 P2 — Auto-Suggest Client Match Test Suite\n");

let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log(`\n${passed}/${tests.length} passed (${failed} failed)`);

if (failed > 0) {
  process.exit(1);
}