/**
 * Smart Summary Generator
 *
 * Generates narrative report text dari metrics data menggunakan
 * pattern-matching & threshold analysis (no external AI API needed).
 *
 * Output: Summary, Performance Notes, Conclusion, Action Plan
 */

interface MetricsData {
  spend?: number;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  cpr?: number;
  revenue?: number;
  roas?: number;
  wa_leads?: number;
  frequency?: number;
  link_clicks?: number;
}

interface PreviousMetrics {
  [key: string]: number | undefined;
}

interface GeneratedReport {
  summary: string;
  performance_text: string;
  conclusion: string;
  action: string;
}

// ─── Thresholds (configurable) ───
const THRESHOLDS = {
  ROAS_GOOD: 3,
  ROAS_OK: 1,
  CTR_GOOD: 1.5,
  CTR_OK: 0.8,
  FREQUENCY_HIGH: 3,
  FREQUENCY_CRITICAL: 5,
};

// ─── Helpers ───
function delta(current: number | undefined, prev: number | undefined): number | null {
  if (!current || !prev || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function fmtPct(val: number | undefined): string {
  if (!val || isNaN(val)) return "-";
  return `${val.toFixed(2)}%`;
}

function fmtIDR(val: number | undefined): string {
  if (!val || isNaN(val)) return "-";
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`;
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`;
  return `Rp ${val.toFixed(0)}`;
}

function trendWord(d: number | null): { word: string; emoji: string } {
  if (d === null) return { word: "stabil", emoji: "➡️" };
  if (d > 20) return { word: "meningkat signifikan", emoji: "📈" };
  if (d > 5) return { word: "meningkat", emoji: "📈" };
  if (d > -5) return { word: "stabil", emoji: "➡️" };
  if (d > -20) return { word: "menurun", emoji: "📉" };
  return { word: "menurun signifikan", emoji: "📉" };
}

function roasStatus(roas: number | undefined): { label: string; color: string } {
  if (!roas) return { label: "belum terukur", color: "gray" };
  if (roas >= THRESHOLDS.ROAS_GOOD) return { label: "sangat sehat", color: "green" };
  if (roas >= THRESHOLDS.ROAS_OK) return { label: "cukup", color: "yellow" };
  return { label: "di bawah target", color: "red" };
}

function ctrStatus(ctr: number | undefined): { label: string; color: string } {
  if (!ctr) return { label: "belum terukur", color: "gray" };
  if (ctr >= THRESHOLDS.CTR_GOOD) return { label: "baik", color: "green" };
  if (ctr >= THRESHOLDS.CTR_OK) return { label: "rata-rata", color: "yellow" };
  return { label: "rendah", color: "red" };
}

// ─── Main Generator ───
export function generateReportText(
  m: MetricsData,
  prev: PreviousMetrics = {},
  clientName: string = "Client"
): GeneratedReport {
  const roasState = roasStatus(m.roas);
  const ctrState = ctrStatus(m.ctr);

  const spendDelta = delta(m.spend, prev.spend);
  const roasDelta = delta(m.roas, prev.roas);
  const ctrDelta = delta(m.ctr, prev.ctr);
  const convDelta = delta(m.conversions, prev.conversions);
  const cprDelta = delta(m.cpr, prev.cpr);

  const spendTrend = trendWord(spendDelta);
  const roasTrend = trendWord(roasDelta);
  const convTrend = trendWord(convDelta);

  // ─── 1. SUMMARY ───
  const summaryParts: string[] = [];

  summaryParts.push(`Minggu ini ${clientName} menghabiskan budget iklan ${fmtIDR(m.spend)}`);

  if (m.conversions !== undefined) {
    summaryParts.push(`dengan total ${m.conversions} konversi`);
  }

  if (m.roas !== undefined) {
    summaryParts.push(`ROAS ${m.roas.toFixed(2)}x (${roasState.label})`);
  }

  if (spendDelta !== null) {
    summaryParts.push(`Spend ${spendTrend.word} ${Math.abs(spendDelta).toFixed(0)}% dibanding minggu lalu ${spendTrend.emoji}`);
  }

  let summary = summaryParts.join(", ") + ".";

  // ─── 2. PERFORMANCE NOTES ───
  const perfParts: string[] = [];

  // CTR analysis
  perfParts.push(`CTR berada di ${fmtPct(m.ctr)} (${ctrState.label})`);
  if (ctrDelta !== null) {
    const t = trendWord(ctrDelta);
    perfParts.push(`(${t.word} ${Math.abs(ctrDelta).toFixed(0)}% WoW)`);
  }

  // Frequency check
  if (m.frequency !== undefined) {
    if (m.frequency >= THRESHOLDS.FREQUENCY_CRITICAL) {
      perfParts.push(`⚠️ Frequency tinggi (${m.frequency.toFixed(1)}x) — audience mulai jenuh, perlu refresh creative`);
    } else if (m.frequency >= THRESHOLDS.FREQUENCY_HIGH) {
      perfParts.push(`Frequency ${m.frequency.toFixed(1)}x — mendekati batas optimal, siapkan creative baru`);
    } else {
      perfParts.push(`Frequency ${m.frequency.toFixed(1)}x masih dalam batas sehat`);
    }
  }

  // CPR analysis
  if (m.cpr !== undefined && m.cpr > 0) {
    perfParts.push(`CPR ${fmtIDR(m.cpr)}`);
    if (cprDelta !== null) {
      if (cprDelta < 0) {
        perfParts.push(`(turun ${Math.abs(cprDelta).toFixed(0)}% — lebih efisien 👍)`);
      } else {
        perfParts.push(`(naik ${cprDelta.toFixed(0)}% — perlu evaluasi)`);
      }
    }
  }

  // Funnel efficiency
  if (m.clicks !== undefined && m.impressions !== undefined && m.impressions > 0) {
    const cvr = m.conversions && m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0;
    perfParts.push(`Conversion rate dari klik: ${cvr.toFixed(1)}%`);
  }

  const performance_text = perfParts.join(". ") + ".";

  // ─── 3. CONCLUSION ───
  const conclusionParts: string[] = [];

  if (m.roas !== undefined) {
    if (m.roas >= THRESHOLDS.ROAS_GOOD) {
      conclusionParts.push(`Performa kampanye minggu ini SANGAT BAIK dengan ROAS ${m.roas.toFixed(2)}x (di atas 3x target).`);
    } else if (m.roas >= THRESHOLDS.ROAS_OK) {
      conclusionParts.push(`Performa kampanye CUKUP dengan ROAS ${m.roas.toFixed(2)}x — masih above break-even tapi belum optimal.`);
    } else {
      conclusionParts.push(`Performa kampanye PERLU PERHATIAN — ROAS ${m.roas.toFixed(2)}x di bawah break-even (1x).`);
    }
  }

  // WoW trend
  if (roasDelta !== null && convDelta !== null) {
    if (roasDelta > 0 && convDelta > 0) {
      conclusionParts.push(`Trend mingguan positif: ROAS naik ${roasDelta.toFixed(0)}% dan konversi naik ${convDelta.toFixed(0)}%.`);
    } else if (roasDelta < -10 || convDelta < -10) {
      conclusionParts.push(`⚠️ Ada penurunan: ROAS ${roasDelta.toFixed(0)}%, konversi ${convDelta.toFixed(0)}% — investigasi penyebab.`);
    }
  }

  // Budget efficiency
  if (m.spend !== undefined && m.conversions !== undefined && m.conversions > 0) {
    const costPerConv = m.spend / m.conversions;
    conclusionParts.push(`Efisiensi biaya per konversi: ${fmtIDR(costPerConv)}.`);
  }

  const conclusion = conclusionParts.join(" ") || "Data belum cukup untuk kesimpulan.";

  // ─── 4. ACTION PLAN ───
  const actionParts: string[] = [];

  // Frequency-based action
  if (m.frequency !== undefined && m.frequency >= THRESHOLDS.FREQUENCY_HIGH) {
    actionParts.push("🔁 Segera upload 2-3 creative baru untuk combat ad fatigue (frequency tinggi)");
  } else {
    actionParts.push("✅ Lanjutkan distribusi budget sesuai pacing");
  }

  // ROAS-based action
  if (m.roas !== undefined) {
    if (m.roas >= THRESHOLDS.ROAS_GOOD) {
      actionParts.push("💰 Skalakan budget 20-30% karena ROAS sangat sehat");
    } else if (m.roas < THRESHOLDS.ROAS_OK) {
      actionParts.push("🔧 Audit targeting & creative — ROAS di bawah break-even");
    }
  }

  // CTR-based action
  if (m.ctr !== undefined && m.ctr < THRESHOLDS.CTR_OK) {
    actionParts.push("🎨 Test hook/headline baru — CTR rendah menandakan creative kurang menarik");
  }

  // CPR optimization
  if (cprDelta !== null && cprDelta > 20) {
    actionParts.push("📊 CPR naik signifikan — cek kompetisi lelang & audience overlap");
  }

  // Conversion optimization
  if (m.clicks !== undefined && m.conversions !== undefined && m.clicks > 0) {
    const cvr = (m.conversions / m.clicks) * 100;
    if (cvr < 2) {
      actionParts.push("🔗 Review landing page — CVR rendah (<2%) mungkin ada friction");
    }
  }

  actionParts.push("📈 Monitor metrik harian & siapkan iterasi creative untuk minggu depan");

  const action = actionParts.join(". ") + ".";

  return { summary, performance_text, conclusion, action };
}