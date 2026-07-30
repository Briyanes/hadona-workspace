/**
 * Meta Marketing API Helper
 * Handles OAuth flow, ad account listing, and insights pulling
 */

const META_API_VERSION = "v22.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Note: Only request scopes that are available in Development Mode without App Review.
// "business_management" and "read_insights" cause "Invalid Scopes" error.
const SCOPES = [
  "ads_read",          // Read ad account insights
  "ads_management",    // Manage ads
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
