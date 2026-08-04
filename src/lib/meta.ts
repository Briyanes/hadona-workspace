/**
 * Meta Marketing API Helper
 * Handles OAuth flow, ad account listing, and insights pulling
 */

const META_API_VERSION = "v22.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Note: Only request scopes that are available in Development Mode without App Review.
// "business_management" and "read_insights" cause "Invalid Scopes" error.
// FIX A1: Removed "ads_management" — we only READ data, never modify ads.
// This reduces App Review friction and improves security posture.
const SCOPES = [
  "ads_read",          // Read ad account insights (sufficient for sync)
].join(",");

/**
 * Generate Facebook OAuth URL for user to authorize
 */
export function getMetaAuthUrl(redirectUri: string, state?: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not set");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: "code",
    state: state || "",
  });

  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token (server-side only)
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID or META_APP_SECRET not set");

  const url = `${META_GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })}`;

  const res = await fetch(url, { method: "GET" });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta OAuth Error: ${data.error.message}`);
  }

  return data;
}

/**
 * Get long-lived access token (60 days) from short-lived token
 */
export async function getLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID or META_APP_SECRET not set");

  const url = `${META_GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  })}`;

  const res = await fetch(url, { method: "GET" });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta Token Exchange Error: ${data.error.message}`);
  }

  return data;
}

/**
 * Get user profile from Meta
 */
export async function getMetaUser(accessToken: string): Promise<{
  id: string;
  name: string;
  email?: string;
}> {
  const url = `${META_GRAPH_BASE}/me?fields=id,name,email&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta User Error: ${data.error.message}`);
  }

  return data;
}

/**
 * List all ad accounts the user has access to (personal accounts only)
 */
export async function getAdAccounts(accessToken: string): Promise<
  Array<{
    id: string;
    account_id: string;
    name: string;
    account_status: number;
    currency: string;
    timezone_name: string;
    spend_cap: string;
    amount_spent: string;
    balance: string;
  }>
> {
  const url = `${META_GRAPH_BASE}/me/adaccounts?fields=id,account_id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance&limit=100&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    const errMsg = data.error?.message || data.error?.type || `HTTP ${res.status}`;
    const errCode = data.error?.code || "unknown";
    throw new Error(`Meta AdAccounts Error [${errCode}]: ${errMsg}`);
  }

  return data.data || [];
}

/**
 * List ALL ad accounts owned by a Business Portfolio (BM)
 * This returns accounts that are managed under the business, not just personal ones.
 *
 * @param businessId - The Meta Business Portfolio ID (e.g., "1380114199447586")
 * @param accessToken - User access token with access to the BM
 */
export async function getBusinessAdAccounts(
  businessId: string,
  accessToken: string
): Promise<
  Array<{
    id: string;
    account_id: string;
    name: string;
    account_status: number;
    currency: string;
    timezone_name: string;
    spend_cap: string;
    amount_spent: string;
    balance: string;
  }>
> {
  const fields = "id,account_id,name,account_status,currency,timezone_name,spend_cap,amount_spent,balance";
  const url = `${META_GRAPH_BASE}/${businessId}/owned_ad_accounts?fields=${fields}&limit=100&access_token=${accessToken}`;

  console.log(`[Meta] Fetching business ad accounts for BM ${businessId}...`);
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    const errMsg = data.error?.message || data.error?.type || `HTTP ${res.status}`;
    const errCode = data.error?.code || "unknown";
    throw new Error(`Meta Business AdAccounts Error [${errCode}]: ${errMsg}`);
  }

  const accounts = data.data || [];
  console.log(`[Meta] Found ${accounts.length} ad accounts in BM ${businessId}`);

  // Handle pagination if there are more results
  let nextPage = data.paging?.next;
  while (nextPage) {
    console.log(`[Meta] Fetching next page of business ad accounts...`);
    const pageRes = await fetch(nextPage);
    const pageData = await pageRes.json();

    if (pageData.error) {
      console.error(`[Meta] Pagination error:`, pageData.error.message);
      break;
    }

    accounts.push(...(pageData.data || []));
    nextPage = pageData.paging?.next;
  }

  console.log(`[Meta] Total ad accounts fetched from BM: ${accounts.length}`);
  return accounts;
}

/**
 * Get all businesses the user has access to
 * Useful for auto-detecting the Business Portfolio ID
 */
export async function getUserBusinesses(accessToken: string): Promise<
  Array<{
    id: string;
    name: string;
    vertical?: string;
  }>
> {
  const url = `${META_GRAPH_BASE}/me/businesses?fields=id,name,vertical&limit=10&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    const errMsg = data.error?.message || data.error?.type || `HTTP ${res.status}`;
    const errCode = data.error?.code || "unknown";
    throw new Error(`Meta Businesses Error [${errCode}]: ${errMsg}`);
  }

  return data.data || [];
}

export interface AdInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  // actions array contains conversions, leads, etc.
  actions?: Array<{ action_type: string; value: string }>;
}

/**
 * Get daily insights/spend for an ad account
 * @param adAccountId - format: "act_1234567890"
 * @param dateStart - "YYYY-MM-DD"
 * @param dateEnd - "YYYY-MM-DD"
 */
export async function getAdAccountInsights(
  accessToken: string,
  adAccountId: string,
  dateStart: string,
  dateEnd: string
): Promise<AdInsight[]> {
  // Ensure adAccountId starts with "act_"
  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  const params = new URLSearchParams({
    access_token: accessToken,
    fields: "spend,impressions,clicks,actions",
    time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
    level: "account",
    time_increment: "1", // Daily breakdown
  });

  const url = `${META_GRAPH_BASE}/${actId}/insights?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    const errMsg = data.error?.message || data.error?.type || `HTTP ${res.status}`;
    const errCode = data.error?.code || "unknown";
    throw new Error(`Meta Insights Error (${actId}) [${errCode}]: ${errMsg}`);
  }

  return data.data || [];
}

/**
 * FIX A5: Extract purchase revenue from Meta Pixel actions array.
 * Meta stores purchase value in action_values, not actions.
 *
 * @param actions - The actions array from insights
 * @param actionValues - The action_values array (contains monetary values)
 * @returns Revenue amount in account currency
 */
export function extractRevenue(
  actions?: Array<{ action_type: string; value: string }>,
  actionValues?: Array<{ action_type: string; value: string }>
): number {
  // Primary: action_values contains the monetary value of conversions
  if (actionValues && actionValues.length > 0) {
    const revenueTypes = [
      "offsite_conversion.fb_pixel_purchase",
      "offsite_conversion.fb_pixel_add_to_cart",
      "offsite_conversion.fb_pixel_initiate_checkout",
      "omni_purchase",
      "omni_add_to_cart",
    ];
    let total = 0;
    for (const av of actionValues) {
      if (revenueTypes.includes(av.action_type)) {
        total += parseFloat(av.value) || 0;
      }
    }
    if (total > 0) return total;
  }

  // Fallback: If we have purchase count but no value, estimate from actions
  if (actions && actions.length > 0) {
    const purchaseAction = actions.find(
      (a) => a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "purchase"
    );
    if (purchaseAction) {
      // Can't extract actual revenue without action_values — return 0 to avoid inaccurate data
      return 0;
    }
  }

  return 0;
}

/**
 * Helper: Extract conversion count from actions array
 */
export function extractConversions(actions?: Array<{ action_type: string; value: string }>): number {
  if (!actions) return 0;
  
  // Meta uses various action types for conversions
  const conversionTypes = [
    "offsite_conversion.fb_pixel_purchase",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_complete_registration",
    "purchase",
    "lead",
    "complete_registration",
  ];

  let total = 0;
  for (const action of actions) {
    if (conversionTypes.includes(action.action_type)) {
      total += parseFloat(action.value) || 0;
    }
  }
  return total;
}

/**
 * FIX A3: Batch API — Fetch insights for multiple ad accounts in a single HTTP call.
 * Meta's Batch API supports up to 50 requests per batch.
 *
 * @param accessToken - User access token
 * @param accounts - Array of { id, adAccountId }
 * @param dateStart - "YYYY-MM-DD"
 * @param dateEnd - "YYYY-MM-DD"
 * @returns Map of adAccountId → AdInsight[]
 */
export async function getBatchInsights(
  accessToken: string,
  accounts: Array<{ id: string; adAccountId: string }>,
  dateStart: string,
  dateEnd: string
): Promise<Record<string, AdInsight[]>> {
  const results: Record<string, AdInsight[]> = {};
  const BATCH_SIZE = 50; // Meta allows max 50 per batch

  // Process in chunks of 50
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);

    // Build batch payload
    const batchPayload = batch.map((acc) => {
      const actId = acc.adAccountId.startsWith("act_")
        ? acc.adAccountId
        : `act_${acc.adAccountId}`;

      const params = new URLSearchParams({
        fields: "spend,impressions,clicks,actions,action_values",
        time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
        level: "account",
        time_increment: "1",
      });

      return {
        method: "GET",
        relative_url: `${actId}/insights?${params.toString()}`,
      };
    });

    const url = `${META_GRAPH_BASE}/?batch=${JSON.stringify(batchPayload)}&access_token=${accessToken}`;

    console.log(`[Meta] Batch API: Fetching insights for ${batch.length} accounts (chunk ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(accounts.length / BATCH_SIZE)})`);

    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      console.error(`[Meta] Batch API error: ${errMsg}`);
      continue;
    }

    // Process batch responses
    for (let j = 0; j < batch.length; j++) {
      const acc = batch[j];
      const batchResponse = data[j];

      if (!batchResponse || batchResponse.code !== 200) {
        const errMsg = batchResponse?.body ? JSON.parse(batchResponse.body).error?.message : "No response";
        console.warn(`[Meta] Batch item failed for ${acc.adAccountId}: ${errMsg}`);
        results[acc.adAccountId] = [];
        continue;
      }

      const body = JSON.parse(batchResponse.body);
      results[acc.adAccountId] = body.data || [];
    }

    // 500ms delay between batch chunks to stay within rate limits
    if (i + BATCH_SIZE < accounts.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * FIX A4: Refresh a long-lived user token.
 * Meta long-lived tokens expire after 60 days. This endpoint extends them.
 *
 * Note: Meta only allows refreshing tokens that have > 24h remaining.
 * If the token is already expired, user must re-authenticate via OAuth.
 *
 * @param accessToken - The current long-lived access token
 * @returns New token + expiry date
 */
export async function refreshLongLivedToken(accessToken: string): Promise<{
  access_token: string;
  token_type: string;
  expires_in: number;
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID or META_APP_SECRET not set");

  const url = `${META_GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: accessToken,
  })}`;

  const res = await fetch(url, { method: "GET" });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta Token Refresh Error: ${data.error.message}`);
  }

  return data;
}

/**
 * FIX A4: Check if token needs refresh (within 7 days of expiry).
 */
export function shouldRefreshToken(expiresAt: string | null): boolean {
  if (!expiresAt) return false;

  const expiry = new Date(expiresAt);
  const now = new Date();
  const daysToExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // Refresh if within 7 days of expiry (and not already expired)
  return daysToExpiry > 0 && daysToExpiry <= 7;
}

/**
 * Check if a token is a System User token (permanent, no expiry).
 * System User tokens bypass App Review requirements and never expire.
 *
 * @returns true if the token is a valid System User token
 */
export async function isSystemUserToken(accessToken: string): Promise<boolean> {
  try {
    const debugData = await debugToken(accessToken);
    // System User tokens have type "SYSTEM_USER" and expires_at = 0 (never expires)
    return debugData.data.type === "SYSTEM_USER" || debugData.data.expires_at === 0;
  } catch {
    return false;
  }
}

/**
 * Debug/inspect a token to get its expiry, scopes, and validity.
 * Uses the App Access Token to call the debug_token endpoint.
 */
export async function debugToken(accessTokenToInspect: string): Promise<{
  data: {
    app_id: string;
    application: string;
    expires_at: number;      // 0 = never expires
    is_valid: boolean;
    scopes: string[];
    type: string;
  };
}> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("META_APP_ID or META_APP_SECRET not set");

  // Generate app access token for debugging
  const appTokenUrl = `${META_GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "client_credentials",
  })}`;

  const appTokenRes = await fetch(appTokenUrl);
  const appTokenData = await appTokenRes.json();

  if (appTokenData.error) {
    throw new Error(`Failed to get app token: ${appTokenData.error.message}`);
  }

  const debugUrl = `${META_GRAPH_BASE}/debug_token?input_token=${accessTokenToInspect}&access_token=${appTokenData.access_token}`;
  const res = await fetch(debugUrl);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Token Debug Error: ${data.error.message}`);
  }

  return data;
}

/**
 * Get extended token information including expiry date
 */
export async function getTokenInfo(accessToken: string): Promise<{
  isValid: boolean;
  expiresAt: Date | null;
  scopes: string[];
}> {
  try {
    const debugData = await debugToken(accessToken);
    return {
      isValid: debugData.data.is_valid,
      expiresAt: debugData.data.expires_at > 0 ? new Date(debugData.data.expires_at * 1000) : null,
      scopes: debugData.data.scopes || [],
    };
  } catch {
    return { isValid: false, expiresAt: null, scopes: [] };
  }
}
