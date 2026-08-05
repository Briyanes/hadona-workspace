/**
 * 🎯 Objective-Aware Metric System
 * ============================================================================
 * Config 22 objective (Meta, Google, TikTok) dengan metric mapping exact.
 * Setiap objective punya:
 *   - primaryMetrics   → KPI utama (tampil BIG di Hero bar)
 *   - funnelMetrics    → Visual funnel steps
 *   - secondaryMetrics → Metric pendukung (tampil di tabel)
 *   - hiddenMetrics    → Metric TIDAK RELEVAN (auto-hide)
 *   - successBenchmark → Target healthy untuk color-coding (green/amber/red)
 *
 * Reference: Meta Ads Manager standard + Agency tier-1 spec
 * ============================================================================
 */

export type Platform = "meta" | "google" | "tiktok";

export type MetricKey =
  // Universal metrics
  | "amount_spent"
  | "impressions"
  | "results"
  | "cost_per_result"
  // Awareness & Engagement
  | "reach"
  | "cost_per_1k_reached"
  | "cpm"
  | "frequency"
  | "clicks_all"
  | "ctr_all"
  | "cpc_all"
  | "link_clicks"
  | "ctr_link"
  | "cpc_link"
  | "outbound_clicks"
  // CTWA Core
  | "messaging_conversations_started"
  | "cost_per_message"
  | "oc_to_wa_ratio"
  // CPAS Sales Funnel
  | "content_views"
  | "cost_per_cv"
  | "lc_to_cv_ratio"
  | "adds_to_cart"
  | "cost_per_atc"
  | "cv_to_atc_ratio"
  | "add_to_cart_value"
  | "purchases"
  | "cost_per_purchase"
  | "atc_to_purchase_ratio"
  | "purchase_roas"
  | "purchase_value"
  | "purchase_rate_per_lc"
  | "aov"
  // CTLP Metrics
  | "landing_page_views"
  | "cost_per_lpv"
  | "oc_to_lpv_ratio"
  | "lc_to_lpv_ratio"
  | "checkouts_initiated"
  | "cost_per_checkout"
  | "lpv_to_ic_ratio"
  // Instagram Traffic
  | "instagram_profile_visits"
  | "instagram_follows"
  | "cost_per_follow"
  // Video
  | "video_views"
  | "vtr"
  | "cpv"
  | "avg_watch_time"
  // App
  | "app_installs"
  | "cpi"
  // Google-specific
  | "quality_score"
  | "impression_share"
  | "vcpm"
  // TikTok-specific
  | "profile_visits_tt"
  | "engagement_rate";

export interface ObjectiveConfig {
  id: string;
  label: string;
  platform: Platform;
  icon: string;
  description: string;
  primaryMetrics: MetricKey[];
  funnelMetrics?: { steps: MetricKey[]; ratios?: MetricKey[] };
  secondaryMetrics: MetricKey[];
  hiddenMetrics: MetricKey[];
  successBenchmark: Partial<Record<MetricKey, { min?: number; max?: number; target?: number }>>;
}

// ============================================================================
// 🔵 META ADS OBJECTIVES (11)
// ============================================================================

const META_OBJECTIVES: ObjectiveConfig[] = [
  // 1. CPAS
  {
    id: "META_CPAS",
    label: "CPAS (Marketplace)",
    platform: "meta",
    icon: "🛒",
    description: "Collaborative Performance Advertising Solution — Shopee Marketplace",
    primaryMetrics: ["purchase_roas", "purchase_value", "aov"],
    funnelMetrics: {
      steps: ["impressions", "link_clicks", "content_views", "adds_to_cart", "purchases"],
      ratios: ["lc_to_cv_ratio", "cv_to_atc_ratio", "atc_to_purchase_ratio"],
    },
    secondaryMetrics: [
      "amount_spent", "cost_per_cv", "cost_per_atc", "cost_per_purchase",
      "reach", "cpm", "frequency", "ctr_all", "cpc_all",
      "instagram_profile_visits", "instagram_follows", "cost_per_follow",
      "results", "cost_per_result",
    ],
    hiddenMetrics: ["messaging_conversations_started", "landing_page_views", "video_views", "app_installs"],
    successBenchmark: {
      purchase_roas: { min: 3 },
      cpc_all: { max: 2000 },
      aov: { min: 100000 },
      ctr_all: { min: 1 },
    },
  },
  // 2. CTWA
  {
    id: "META_CTWA",
    label: "CTWA (Click-to-WhatsApp)",
    platform: "meta",
    icon: "💬",
    description: "Click-to-WhatsApp — Drive percakapan WA baru",
    primaryMetrics: ["messaging_conversations_started", "cost_per_message", "oc_to_wa_ratio"],
    funnelMetrics: {
      steps: ["outbound_clicks", "messaging_conversations_started"],
      ratios: ["oc_to_wa_ratio"],
    },
    secondaryMetrics: [
      "amount_spent", "results", "cost_per_result",
      "instagram_profile_visits", "instagram_follows", "cost_per_follow",
      "reach", "cpm", "frequency", "ctr_all", "cpc_all", "ctr_link", "cpc_link",
    ],
    hiddenMetrics: ["purchase_roas", "purchase_value", "aov", "landing_page_views", "checkouts_initiated", "video_views"],
    successBenchmark: {
      cost_per_message: { max: 8000 },
      oc_to_wa_ratio: { min: 30 },
      ctr_link: { min: 1 },
    },
  },
  // 3. CTLP
  {
    id: "META_CTLP",
    label: "CTLP (Landing Page)",
    platform: "meta",
    icon: "🌐",
    description: "Click-to-Landing Page — OrderOnline, Scalev, dll",
    primaryMetrics: ["landing_page_views", "cost_per_lpv", "checkouts_initiated"],
    funnelMetrics: {
      steps: ["link_clicks", "content_views", "landing_page_views", "checkouts_initiated"],
      ratios: ["lc_to_cv_ratio", "oc_to_lpv_ratio", "lc_to_lpv_ratio", "lpv_to_ic_ratio"],
    },
    secondaryMetrics: [
      "amount_spent", "cost_per_cv", "cost_per_checkout", "results", "cost_per_result",
      "reach", "cpm", "frequency", "ctr_all", "cpc_all", "ctr_link", "cpc_link",
    ],
    hiddenMetrics: ["purchase_roas", "purchase_value", "messaging_conversations_started", "video_views"],
    successBenchmark: {
      cost_per_lpv: { max: 3000 },
      oc_to_lpv_ratio: { min: 50 },
      ctr_link: { min: 1 },
    },
  },
  // 4. TRAFFIC
  {
    id: "META_TRAFFIC",
    label: "Traffic",
    platform: "meta",
    icon: "🚦",
    description: "Drive traffic ke destination (website, landing page)",
    primaryMetrics: ["link_clicks", "ctr_link", "cpc_link"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "ctr_all", "cpc_all", "outbound_clicks", "impressions"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "video_views"],
    successBenchmark: { cpc_link: { max: 2000 }, ctr_link: { min: 1.5 } },
  },
  // 5. SALES
  {
    id: "META_SALES",
    label: "Sales (E-commerce)",
    platform: "meta",
    icon: "💰",
    description: "Drive penjualan langsung via Meta Pixel / CAPI",
    primaryMetrics: ["purchase_roas", "purchases", "cost_per_purchase"],
    funnelMetrics: {
      steps: ["link_clicks", "content_views", "adds_to_cart", "checkouts_initiated", "purchases"],
      ratios: ["lc_to_cv_ratio", "cv_to_atc_ratio", "lpv_to_ic_ratio", "atc_to_purchase_ratio"],
    },
    secondaryMetrics: ["amount_spent", "purchase_value", "aov", "reach", "cpm", "frequency", "ctr_all", "cpc_all", "results", "cost_per_result"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { purchase_roas: { min: 3 }, cost_per_purchase: { max: 100000 } },
  },
  // 6. LEAD_GEN
  {
    id: "META_LEAD_GEN",
    label: "Lead Generation",
    platform: "meta",
    icon: "📋",
    description: "Drive leads via Instant Forms",
    primaryMetrics: ["results", "cost_per_result"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "ctr_all", "cpc_all", "clicks_all"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "video_views"],
    successBenchmark: { cost_per_result: { max: 50000 }, ctr_all: { min: 1 } },
  },
  // 7. AWARENESS
  {
    id: "META_AWARENESS",
    label: "Awareness",
    platform: "meta",
    icon: "👁️",
    description: "Maximalkan reach & brand awareness",
    primaryMetrics: ["reach", "cost_per_1k_reached", "cpm"],
    secondaryMetrics: ["amount_spent", "impressions", "frequency", "ctr_all", "cpc_all"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "landing_page_views", "video_views"],
    successBenchmark: { cpm: { max: 10000 }, frequency: { max: 4 } },
  },
  // 8. MESSAGES
  {
    id: "META_MESSAGES",
    label: "Messages (Inbox/DM)",
    platform: "meta",
    icon: "📨",
    description: "Drive percakapan via Messenger/Instagram Direct",
    primaryMetrics: ["messaging_conversations_started", "cost_per_message"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "ctr_all", "cpc_all", "results", "cost_per_result"],
    hiddenMetrics: ["purchase_roas", "landing_page_views", "video_views"],
    successBenchmark: { cost_per_message: { max: 5000 } },
  },
  // 9. ENGAGEMENT
  {
    id: "META_ENGAGEMENT",
    label: "Engagement",
    platform: "meta",
    icon: "❤️",
    description: "Drive engagement (likes, comments, shares)",
    primaryMetrics: ["clicks_all", "ctr_all", "engagement_rate"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "cpc_all"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "video_views"],
    successBenchmark: { ctr_all: { min: 2 }, engagement_rate: { min: 5 } },
  },
  // 10. VIDEO_VIEWS
  {
    id: "META_VIDEO_VIEWS",
    label: "Video Views",
    platform: "meta",
    icon: "🎬",
    description: "Drive video views & watch time",
    primaryMetrics: ["video_views", "vtr", "cpv"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "avg_watch_time", "impressions"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "landing_page_views"],
    successBenchmark: { vtr: { min: 15 }, cpv: { max: 500 } },
  },
  // 11. APP_INSTALLS
  {
    id: "META_APP_INSTALLS",
    label: "App Installs",
    platform: "meta",
    icon: "📱",
    description: "Drive install aplikasi mobile",
    primaryMetrics: ["app_installs", "cpi", "cost_per_result"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "ctr_all", "cpc_all", "results"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "video_views"],
    successBenchmark: { cpi: { max: 30000 } },
  },
];

// ============================================================================
// 🟢 GOOGLE ADS OBJECTIVES (6)
// ============================================================================

const GOOGLE_OBJECTIVES: ObjectiveConfig[] = [
  {
    id: "GOOGLE_GDN",
    label: "GDN (Display Network)",
    platform: "google",
    icon: "📊",
    description: "Google Display Network",
    primaryMetrics: ["vcpm", "vtr", "ctr_all"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "cpc_all", "impressions"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started"],
    successBenchmark: { vcpm: { max: 15000 }, vtr: { min: 15 } },
  },
  {
    id: "GOOGLE_DEMAND_GEN",
    label: "Demand Gen",
    platform: "google",
    icon: "⚡",
    description: "Google Demand Generation",
    primaryMetrics: ["purchase_roas", "purchases", "cost_per_purchase"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "ctr_all", "cpc_all", "results", "cost_per_result"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { purchase_roas: { min: 3 } },
  },
  {
    id: "GOOGLE_SEARCH",
    label: "Search",
    platform: "google",
    icon: "🔍",
    description: "Google Search Ads",
    primaryMetrics: ["quality_score", "ctr_all", "cpc_all"],
    secondaryMetrics: ["amount_spent", "impression_share", "reach", "results", "cost_per_result", "purchases", "purchase_roas"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { quality_score: { min: 7 }, ctr_all: { min: 5 } },
  },
  {
    id: "GOOGLE_PMAX",
    label: "Performance Max",
    platform: "google",
    icon: "🚀",
    description: "Google Performance Max",
    primaryMetrics: ["purchase_roas", "purchases", "cost_per_purchase"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "ctr_all", "cpc_all", "results", "cost_per_result", "impression_share"],
    hiddenMetrics: ["messaging_conversations_started"],
    successBenchmark: { purchase_roas: { min: 3 } },
  },
  {
    id: "GOOGLE_YOUTUBE",
    label: "YouTube / Video",
    platform: "google",
    icon: "▶️",
    description: "YouTube Video Ads",
    primaryMetrics: ["vtr", "cpv", "video_views"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "frequency", "avg_watch_time", "impressions"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started"],
    successBenchmark: { vtr: { min: 20 }, cpv: { max: 1000 } },
  },
  {
    id: "GOOGLE_SHOPPING",
    label: "Shopping",
    platform: "google",
    icon: "🛍️",
    description: "Google Shopping Ads",
    primaryMetrics: ["purchase_roas", "purchases", "cost_per_purchase"],
    secondaryMetrics: ["amount_spent", "reach", "ctr_all", "cpc_all", "impression_share", "results", "cost_per_result"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { purchase_roas: { min: 3 } },
  },
];

// ============================================================================
// 🔴 TIKTOK ADS OBJECTIVES (5)
// ============================================================================

const TIKTOK_OBJECTIVES: ObjectiveConfig[] = [
  {
    id: "TIKTOK_GMX_MAX",
    label: "GMX Max (Grow Max)",
    platform: "tiktok",
    icon: "📈",
    description: "TikTok Grow Max — Auto optimize conversions",
    primaryMetrics: ["purchases", "cost_per_purchase", "purchase_roas"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "ctr_all", "cpc_all", "results", "cost_per_result"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { purchase_roas: { min: 3 } },
  },
  {
    id: "TIKTOK_WEB_CONV",
    label: "Web Conversions",
    platform: "tiktok",
    icon: "💻",
    description: "TikTok Web Conversions",
    primaryMetrics: ["cost_per_result", "purchase_roas", "purchases"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "ctr_all", "cpc_all", "results"],
    hiddenMetrics: ["messaging_conversations_started", "video_views"],
    successBenchmark: { purchase_roas: { min: 3 } },
  },
  {
    id: "TIKTOK_REACH",
    label: "Reach",
    platform: "tiktok",
    icon: "📡",
    description: "TikTok Reach objective",
    primaryMetrics: ["reach", "cost_per_1k_reached", "cpm"],
    secondaryMetrics: ["amount_spent", "impressions", "frequency", "ctr_all", "cpc_all"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started"],
    successBenchmark: { cpm: { max: 10000 } },
  },
  {
    id: "TIKTOK_VIDEO_VIEWS",
    label: "Video Views",
    platform: "tiktok",
    icon: "🎥",
    description: "TikTok Video Views",
    primaryMetrics: ["video_views", "vtr", "cpv"],
    secondaryMetrics: ["amount_spent", "reach", "cpm", "avg_watch_time", "impressions"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started"],
    successBenchmark: { vtr: { min: 15 } },
  },
  {
    id: "TIKTOK_COMMUNITY",
    label: "Community Interaction",
    platform: "tiktok",
    icon: "👥",
    description: "TikTok Community Interaction",
    primaryMetrics: ["profile_visits_tt", "instagram_follows", "engagement_rate"],
    secondaryMetrics: ["amount_spent", "reach", "ctr_all", "cpc_all", "clicks_all"],
    hiddenMetrics: ["purchase_roas", "messaging_conversations_started", "video_views"],
    successBenchmark: { engagement_rate: { min: 5 } },
  },
];

// ============================================================================
// EXPORT
// ============================================================================

export const AD_OBJECTIVES: ObjectiveConfig[] = [
  ...META_OBJECTIVES,
  ...GOOGLE_OBJECTIVES,
  ...TIKTOK_OBJECTIVES,
];

export const OBJECTIVE_MAP: Record<string, ObjectiveConfig> = AD_OBJECTIVES.reduce(
  (acc, obj) => ({ ...acc, [obj.id]: obj }),
  {} as Record<string, ObjectiveConfig>
);

// Metric labels (Indonesia)
export const METRIC_LABELS: Record<MetricKey, string> = {
  amount_spent: "Amount Spent",
  impressions: "Impressions",
  results: "Results",
  cost_per_result: "Cost per Result",
  reach: "Reach",
  cost_per_1k_reached: "Cost per 1,000 Reached",
  cpm: "CPM",
  frequency: "Frequency",
  clicks_all: "Clicks (All)",
  ctr_all: "CTR (All)",
  cpc_all: "CPC (All)",
  link_clicks: "Link Clicks",
  ctr_link: "CTR (Link)",
  cpc_link: "CPC (Link)",
  outbound_clicks: "Outbound Clicks",
  messaging_conversations_started: "Messaging Conversations Started",
  cost_per_message: "Cost per Message",
  oc_to_wa_ratio: "OC → WA Ratio",
  content_views: "Content Views",
  cost_per_cv: "Cost / CV",
  lc_to_cv_ratio: "LC → CV Ratio",
  adds_to_cart: "Adds to Cart",
  cost_per_atc: "Cost / ATC",
  cv_to_atc_ratio: "CV → ATC Ratio",
  add_to_cart_value: "Add to Cart Value",
  purchases: "Purchases",
  cost_per_purchase: "Cost / Purchase",
  atc_to_purchase_ratio: "ATC → Purchases",
  purchase_roas: "Purchase ROAS",
  purchase_value: "Purchase Value",
  purchase_rate_per_lc: "Purchase Rate per LC",
  aov: "AOV",
  landing_page_views: "Landing Page Views",
  cost_per_lpv: "Cost / LPV",
  oc_to_lpv_ratio: "OC → LPV Ratio",
  lc_to_lpv_ratio: "LC → LPV Ratio",
  checkouts_initiated: "Checkouts Initiated",
  cost_per_checkout: "Cost / Checkout",
  lpv_to_ic_ratio: "LPV → IC",
  instagram_profile_visits: "Instagram Profile Visits",
  instagram_follows: "Instagram Follows",
  cost_per_follow: "Cost / Follow",
  video_views: "Video Views",
  vtr: "VTR",
  cpv: "CPV",
  avg_watch_time: "Avg Watch Time",
  app_installs: "App Installs",
  cpi: "CPI",
  quality_score: "Quality Score",
  impression_share: "Impression Share",
  vcpm: "VCPM",
  profile_visits_tt: "Profile Visits",
  engagement_rate: "Engagement Rate",
};

// Helper functions
export function getObjective(objectiveId: string): ObjectiveConfig | undefined {
  return OBJECTIVE_MAP[objectiveId];
}

export function getVisibleMetrics(objectiveId: string): MetricKey[] {
  const obj = OBJECTIVE_MAP[objectiveId];
  if (!obj) return [];
  return [...obj.primaryMetrics, ...obj.secondaryMetrics];
}

export function isMetricVisible(objectiveId: string, metric: MetricKey): boolean {
  const obj = OBJECTIVE_MAP[objectiveId];
  if (!obj) return true;
  return !obj.hiddenMetrics.includes(metric);
}

// Format numbers sesuai metric type
export function formatMetricValue(metric: MetricKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const absVal = Math.abs(value);
  
  switch (metric) {
    // Currency (IDR)
    case "amount_spent":
    case "purchase_value":
    case "add_to_cart_value":
      return formatIDR(absVal);
    case "cpm":
    case "cpc_all":
    case "cpc_link":
    case "cost_per_result":
    case "cost_per_message":
    case "cost_per_cv":
    case "cost_per_atc":
    case "cost_per_purchase":
    case "cost_per_lpv":
    case "cost_per_checkout":
    case "cost_per_1k_reached":
    case "cost_per_follow":
    case "cpv":
    case "cpi":
    case "vcpm":
    case "aov":
      return formatIDR(absVal);
    // Percentages
    case "ctr_all":
    case "ctr_link":
    case "vtr":
    case "oc_to_wa_ratio":
    case "lc_to_cv_ratio":
    case "cv_to_atc_ratio":
    case "atc_to_purchase_ratio":
    case "purchase_rate_per_lc":
    case "oc_to_lpv_ratio":
    case "lc_to_lpv_ratio":
    case "lpv_to_ic_ratio":
    case "engagement_rate":
    case "impression_share":
      return `${absVal.toFixed(2)}%`;
    // Multiplication (ROAS)
    case "purchase_roas":
      return `${absVal.toFixed(2)}x`;
    case "frequency":
    case "quality_score":
      return absVal.toFixed(2);
    // Plain integers
    default:
      return absVal.toLocaleString("id-ID");
  }
}

function formatIDR(value: number): string {
  if (value >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(2)}M`;
  if (value >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(2)}Jt`;
  if (value >= 1_000) return `Rp ${(value / 1_000).toFixed(1)}K`;
  return `Rp ${value.toFixed(0)}`;
}

// Color-code berdasarkan benchmark
export function getMetricHealth(
  objectiveId: string,
  metric: MetricKey,
  value: number | null | undefined
): "good" | "warning" | "danger" | "neutral" {
  if (value === null || value === undefined) return "neutral";
  const obj = OBJECTIVE_MAP[objectiveId];
  if (!obj) return "neutral";
  const benchmark = obj.successBenchmark[metric];
  if (!benchmark) return "neutral";
  
  // For "min" targets: higher is better
  if (benchmark.min !== undefined) {
    if (value >= benchmark.min) return "good";
    if (value >= benchmark.min * 0.7) return "warning";
    return "danger";
  }
  // For "max" targets: lower is better
  if (benchmark.max !== undefined) {
    if (value <= benchmark.max) return "good";
    if (value <= benchmark.max * 1.5) return "warning";
    return "danger";
  }
  return "neutral";
}

// Type alias untuk objective ID (untuk konsistensi dengan MetricKey)
export type ObjectiveKey = string;

// Dropdown options untuk form
export const OBJECTIVE_OPTIONS = AD_OBJECTIVES.map((obj) => ({
  value: obj.id,
  label: `${obj.icon} ${obj.label}`,
  platform: obj.platform,
}));

// Grouped objectives untuk UI dropdown selector
export const OBJECTIVE_GROUPS: Array<{
  label: string;
  platform: Platform;
  objectives: string[];
}> = [
  {
    label: "🔵 Meta Ads",
    platform: "meta",
    objectives: META_OBJECTIVES.map((o) => o.id),
  },
  {
    label: "🟢 Google Ads",
    platform: "google",
    objectives: GOOGLE_OBJECTIVES.map((o) => o.id),
  },
  {
    label: "🔴 TikTok Ads",
    platform: "tiktok",
    objectives: TIKTOK_OBJECTIVES.map((o) => o.id),
  },
];

// ============================================================================
// 🎯 HERO METRIC CARDS — Dynamic per Objective
// ============================================================================
// Dipakai oleh /reports page untuk render 4 KPI card utama.
// Return metric yang RELEVAN per objective — bukan generic hardcoded.
// Ref: Sprint 4 — bug fix RMODA CTWA yang ROAS-nya selalu "-".

const HERO_CARD_FALLBACK: MetricKey[] = ["amount_spent", "results", "cost_per_result", "ctr_all"];

/**
 * Return 4 metric card utama yang harus ditampilkan di hero card /reports page,
 * disesuaikan dengan objective. Selalu prioritaskan primaryMetrics, lalu isi
 * dari secondaryMetrics kalau primary < 4. Spend selalu di posisi pertama.
 *
 * @example getHeroCards("META_CTWA")
 * // → ["amount_spent", "messaging_conversations_started", "cost_per_message", "oc_to_wa_ratio"]
 */
export function getHeroCards(objectiveId: string): MetricKey[] {
  const obj = OBJECTIVE_MAP[objectiveId];
  if (!obj) return HERO_CARD_FALLBACK;

  // Spend selalu di posisi pertama (business critical metric).
  // "spend" di-cast ke MetricKey karena bukan key canonical Meta API,
  // tapi tetap valid sebagai alias UI (di-resolve via getMetricByAlias).
  const spendKey: MetricKey = obj.secondaryMetrics.includes("amount_spent")
    ? "amount_spent"
    : ("spend" as MetricKey);

  // Mulai dari primary metrics (kecuali kalau itu amount_spent, jangan duplikat)
  const primaryFiltered = obj.primaryMetrics.filter((m) => m !== spendKey && m !== "amount_spent");

  // Gabungkan: spend + primary + secondary (untuk capai 4 card)
  const candidates: MetricKey[] = [spendKey, ...primaryFiltered];

  // Kalau kurang dari 4, isi dari secondary (skip yang sudah masuk & hidden)
  if (candidates.length < 4) {
    for (const m of obj.secondaryMetrics) {
      if (candidates.length >= 4) break;
      if (!candidates.includes(m) && m !== "amount_spent" && !obj.hiddenMetrics.includes(m)) {
        candidates.push(m);
      }
    }
  }

  // Trim ke 4 card (atau kalau kurang, biarkan)
  return candidates.slice(0, 4);
}

// ============================================================================
// 🔄 METRIC ALIAS RESOLVER
// ============================================================================
// Solve inkonsistensi key: "spend" vs "amount_spent", "roas" vs "purchase_roas",
// "conversions" vs "purchases" vs "messaging_conversations_started".

/**
 * Map alias key (UI/shorthand) → canonical key (ad-objectives / Meta API).
 * NOTE: Value diset ke `string[]` (bukan `MetricKey[]`) karena nilai alias
 * bisa berupa key non-canonical (mis. "spend", "ctr", "roas") yang valid secara
 * runtime tapi tidak masuk union `MetricKey` yang strict.
 */
export const METRIC_ALIASES: Record<string, string[]> = {
  spend: ["amount_spent", "spend"],
  impressions: ["impressions"],
  reach: ["reach"],
  clicks: ["clicks_all", "link_clicks", "outbound_clicks"],
  ctr: ["ctr_all", "ctr_link", "ctr"],
  cpc: ["cpc_all", "cpc_link", "cpc"],
  cpm: ["cpm"],
  frequency: ["frequency"],
  // Hasil / konversi
  conversions: ["purchases", "messaging_conversations_started", "results", "conversions"],
  purchases: ["purchases", "conversions"],
  messages: ["messaging_conversations_started"],
  cpr: ["cost_per_result", "cost_per_purchase", "cost_per_message", "cpr"],
  // Revenue / ROAS
  revenue: ["purchase_value", "revenue"],
  roas: ["purchase_roas", "roas"],
  aov: ["aov"],
};

/**
 * Resolve metric value dari Record<string, number> dengan alias fallback.
 *
 * @example getMetricByAlias(metrics, "spend") → 1093910 (akan cek "amount_spent" lalu "spend")
 */
export function getMetricByAlias(
  metrics: Record<string, number | null | undefined> | undefined | null,
  alias: string
): number | null {
  if (!metrics) return null;

  // Cek exact key dulu
  if (metrics[alias] !== undefined && metrics[alias] !== null) {
    return Number(metrics[alias]) || null;
  }

  // Cek alias map
  const aliases = METRIC_ALIASES[alias];
  if (aliases) {
    for (const key of aliases) {
      if (metrics[key] !== undefined && metrics[key] !== null) {
        return Number(metrics[key]) || null;
      }
    }
  }

  return null;
}
