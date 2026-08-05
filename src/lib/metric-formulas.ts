/**
 * 🧮 Metric Formulas Engine
 * ============================================================================
 * Menghitung 25+ derived metrics dari base data (raw Meta/Google/TikTok API).
 * Dipakai oleh API /api/reports pull-ads untuk auto-calculate.
 *
 * Base data (dari ad_spend_logs):
 *   spend, impressions, clicks, reach, link_clicks, outbound_clicks,
 *   messaging_conversations_started, content_views, adds_to_cart,
 *   purchases, purchase_value, landing_page_views, checkouts_initiated,
 *   instagram_follows, instagram_profile_visits
 * ============================================================================
 */

import { MetricKey } from "./ad-objectives";

export interface BaseMetrics {
  // Raw data dari DB / API
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  link_clicks: number;
  outbound_clicks: number;
  messaging_conversations_started: number;
  content_views: number;
  adds_to_cart: number;
  purchases: number;
  purchase_value: number;
  landing_page_views: number;
  checkouts_initiated: number;
  instagram_follows: number;
  instagram_profile_visits: number;
  conversions: number;
  revenue: number;
  results: number;
  video_views?: number;
  avg_watch_time?: number;
}

export type CalculatedMetrics = Record<MetricKey, number | null>;

/**
 * Hitung SEMUA derived metrics dari base data
 */
export function calculateAllMetrics(base: Partial<BaseMetrics>): CalculatedMetrics {
  const spend = base.spend ?? 0;
  const impressions = base.impressions ?? 0;
  const clicks = base.clicks ?? 0;
  const reach = base.reach ?? 0;
  const linkClicks = base.link_clicks ?? 0;
  const outboundClicks = base.outbound_clicks ?? 0;
  const msgStarted = base.messaging_conversations_started ?? 0;
  const contentViews = base.content_views ?? 0;
  const atc = base.adds_to_cart ?? 0;
  const purchases = base.purchases ?? 0;
  const purchaseValue = base.purchase_value ?? base.revenue ?? 0;
  const lpv = base.landing_page_views ?? 0;
  const checkouts = base.checkouts_initiated ?? 0;
  const igFollows = base.instagram_follows ?? 0;
  const igVisits = base.instagram_profile_visits ?? 0;
  const results = base.results ?? base.conversions ?? 0;

  return {
    // === UNIVERSAL ===
    amount_spent: spend,
    impressions: impressions,
    results: results,
    cost_per_result: safeDiv(spend, results),

    // === AWARENESS & ENGAGEMENT ===
    reach: reach,
    cost_per_1k_reached: reach > 0 ? (spend / reach) * 1000 : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    frequency: reach > 0 ? impressions / reach : null,
    clicks_all: clicks,
    ctr_all: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc_all: clicks > 0 ? spend / clicks : null,
    link_clicks: linkClicks,
    ctr_link: impressions > 0 ? (linkClicks / impressions) * 100 : null,
    cpc_link: linkClicks > 0 ? spend / linkClicks : null,
    outbound_clicks: outboundClicks,

    // === CTWA CORE ===
    messaging_conversations_started: msgStarted,
    cost_per_message: msgStarted > 0 ? spend / msgStarted : null,
    // 🆕 Sprint 4.8: Fallback proxy chain — kalau outbound_clicks kosong,
    // pakai link_clicks → clicks_all supaya OC→WA tetap terhitung.
    // (Real sheet Hadona sering tidak isi Outbound Clicks eksplisit)
    oc_to_wa_ratio: (() => {
      const effectiveOC =
        outboundClicks > 0 ? outboundClicks
        : linkClicks > 0 ? linkClicks
        : clicks > 0 ? clicks
        : 0;
      return effectiveOC > 0 ? (msgStarted / effectiveOC) * 100 : null;
    })(),

    // === CPAS SALES FUNNEL ===
    content_views: contentViews,
    cost_per_cv: contentViews > 0 ? spend / contentViews : null,
    lc_to_cv_ratio: linkClicks > 0 ? (contentViews / linkClicks) * 100 : null,
    adds_to_cart: atc,
    cost_per_atc: atc > 0 ? spend / atc : null,
    cv_to_atc_ratio: contentViews > 0 ? (atc / contentViews) * 100 : null,
    add_to_cart_value: null, // Tidak tersedia dari API standar
    purchases: purchases,
    cost_per_purchase: purchases > 0 ? spend / purchases : null,
    atc_to_purchase_ratio: atc > 0 ? (purchases / atc) * 100 : null,
    purchase_roas: spend > 0 ? purchaseValue / spend : null,
    purchase_value: purchaseValue,
    purchase_rate_per_lc: linkClicks > 0 ? (purchases / linkClicks) * 100 : null,
    aov: purchases > 0 ? purchaseValue / purchases : null,

    // === CTLP METRICS ===
    landing_page_views: lpv,
    cost_per_lpv: lpv > 0 ? spend / lpv : null,
    oc_to_lpv_ratio: outboundClicks > 0 ? (lpv / outboundClicks) * 100 : null,
    lc_to_lpv_ratio: linkClicks > 0 ? (lpv / linkClicks) * 100 : null,
    checkouts_initiated: checkouts,
    cost_per_checkout: checkouts > 0 ? spend / checkouts : null,
    lpv_to_ic_ratio: lpv > 0 ? (checkouts / lpv) * 100 : null,

    // === INSTAGRAM TRAFFIC ===
    instagram_profile_visits: igVisits,
    instagram_follows: igFollows,
    cost_per_follow: igFollows > 0 ? spend / igFollows : null,

    // === VIDEO ===
    video_views: base.video_views ?? null,
    vtr: impressions > 0 && base.video_views ? (base.video_views / impressions) * 100 : null,
    cpv: base.video_views && base.video_views > 0 ? spend / base.video_views : null,
    avg_watch_time: base.avg_watch_time ?? null,

    // === APP ===
    app_installs: null,
    cpi: null,

    // === GOOGLE-SPECIFIC ===
    quality_score: null,
    impression_share: null,
    vcpm: impressions > 0 ? (spend / impressions) * 1000 : null,

    // === TIKTOK-SPECIFIC ===
    profile_visits_tt: null,
    engagement_rate: impressions > 0 ? (clicks / impressions) * 100 : null,
  };
}

/**
 * Hitung SATU metric spesifik
 */
export function calculateMetric(metric: MetricKey, base: Partial<BaseMetrics>): number | null {
  const all = calculateAllMetrics(base);
  return all[metric] ?? null;
}

/**
 * Aggregate base metrics dari multiple log entries (weekly sum)
 */
export function aggregateBaseMetrics(logs: Partial<BaseMetrics>[]): BaseMetrics {
  const result: BaseMetrics = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    link_clicks: 0,
    outbound_clicks: 0,
    messaging_conversations_started: 0,
    content_views: 0,
    adds_to_cart: 0,
    purchases: 0,
    purchase_value: 0,
    landing_page_views: 0,
    checkouts_initiated: 0,
    instagram_follows: 0,
    instagram_profile_visits: 0,
    conversions: 0,
    revenue: 0,
    results: 0,
    video_views: 0,
    avg_watch_time: undefined,
  };

  for (const log of logs) {
    result.spend += log.spend ?? 0;
    result.impressions += log.impressions ?? 0;
    result.clicks += log.clicks ?? 0;
    result.reach += log.reach ?? 0; // Note: reach ini sum daily reach (bukan unique weekly)
    result.link_clicks += log.link_clicks ?? 0;
    result.outbound_clicks += log.outbound_clicks ?? 0;
    result.messaging_conversations_started += log.messaging_conversations_started ?? 0;
    result.content_views += log.content_views ?? 0;
    result.adds_to_cart += log.adds_to_cart ?? 0;
    result.purchases += log.purchases ?? 0;
    result.purchase_value += log.purchase_value ?? 0;
    result.landing_page_views += log.landing_page_views ?? 0;
    result.checkouts_initiated += log.checkouts_initiated ?? 0;
    result.instagram_follows += log.instagram_follows ?? 0;
    result.instagram_profile_visits += log.instagram_profile_visits ?? 0;
    result.conversions += log.conversions ?? 0;
    result.revenue += log.revenue ?? 0;
    result.results += log.results ?? 0;
    result.video_views = (result.video_views ?? 0) + (log.video_views ?? 0);
    result.avg_watch_time = log.avg_watch_time ?? result.avg_watch_time;
  }

  return result;
}

/**
 * Calculate WoW (Week-over-Week) change percentage
 */
export function calculateWoWChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Format WoW change untuk display
 */
export function formatWoWChange(change: number | null, higherIsBetter: boolean = true): { text: string; color: string } {
  if (change === null) return { text: "—", color: "text-gray-400" };
  
  const arrow = change >= 0 ? "↑" : "↓";
  const absChange = Math.abs(change).toFixed(1);
  
  if (change >= 0) {
    return {
      text: `${arrow} ${absChange}%`,
      color: higherIsBetter ? "text-green-600" : "text-red-600",
    };
  } else {
    return {
      text: `${arrow} ${absChange}%`,
      color: higherIsBetter ? "text-red-600" : "text-green-600",
    };
  }
}

/**
 * Safe division helper (avoid divide by zero)
 */
function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0 || isNaN(denominator)) return null;
  return numerator / denominator;
}