import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyRateLimit } from "@/lib/auth-api";
import {
  getAdAccountInsights,
  extractConversions,
  extractRevenue,
  getAdAccounts,
  getBusinessAdAccounts,
  getBatchInsights,
  refreshLongLivedToken,
  shouldRefreshToken,
} from "@/lib/meta";

// Hadona's Business Portfolio ID
const HADONA_BM_ID = process.env.META_BUSINESS_ID || "1380114199447586";

/**
 * Sleep helper for rate-limit protection
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for Meta API calls — handles rate limiting gracefully
 */
async function getInsightsWithRetry(
  accessToken: string,
  adAccountId: string,
  dateStart: string,
  dateEnd: string,
  maxRetries = 3
): Promise<{ data: Awaited<ReturnType<typeof getAdAccountInsights>>; error: string | null }> {
  let lastError = "";
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const insights = await getAdAccountInsights(accessToken, adAccountId, dateStart, dateEnd);
      return { data: insights, error: null };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "unknown";
      lastError = errMsg;

      // Meta rate limit error codes: 4, 17, 32, 613
      const isRateLimit =
        errMsg.includes("rate limit") ||
        errMsg.includes("[4]") ||
        errMsg.includes("[17]") ||
        errMsg.includes("[32]") ||
        errMsg.includes("[613]") ||
        errMsg.includes("too many calls");

      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff: 2s, 4s, 8s
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[Sync] ⏳ Rate limited on ${adAccountId}, retry ${attempt + 1}/${maxRetries} in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      // Not a rate limit or max retries reached
      return { data: [], error: errMsg };
    }
  }
  return { data: [], error: lastError };
}

/**
 * Detailed error entry for tracking
 */
interface AccountError {
  id: string;
  error: string;
}

interface MetaConnection {
  id: string;
  user_id: string;
  fb_user_id: string;
  access_token: string;
  fb_user_name: string | null;
  token_expires_at: string | null;
  is_active: boolean;
  auto_sync: boolean;
}

interface MetaAdAccount {
  id: string;
  ad_account_id: string;
  client_id: string | null;
}

interface ExistingAcc {
  id: string;
  ad_account_id: string;
  account_name: string | null;
  client_id: string | null;
}

/**
 * Extended AdInsight that includes action_values (monetary conversion values).
 * Used by Batch API which requests action_values field.
 */
interface AdInsightWithActionValues {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

/**
 * Create Supabase admin client using SERVICE ROLE KEY (bypasses RLS).
 * Required for sync operations: meta_connections, ad_accounts, ad_spend_logs.
 *
 * The default createClient() uses ANON_KEY + cookies → subject to RLS,
 * which blocks admin operations like bulk INSERT/UPDATE on ad_accounts.
 */
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/meta/sync
 * Syncs spend data from Meta Marketing API → ad_spend_logs table
 *
 * Can be triggered by:
 * 1. Vercel Cron (daily auto-sync)
 * 2. Manual button click "Sync Now" from frontend
 *
 * Body params (optional):
 * - connection_id: sync specific connection only
 * - date: sync specific date (YYYY-MM-DD), defaults to yesterday
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${cronSecret}`;

  // If not cron, verify user session
  let userId: string | null = null;
  if (!isCron) {
    // Rate limit: 3 manual syncs/hour per IP — sangat berat (Meta API + Batch insights)
    const rateLimited = applyRateLimit(request, "meta-sync", 3, 60 * 60 * 1000);
    if (rateLimited) return rateLimited;

    // Verify user is logged in via Supabase Auth
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  try {
    let body: { connection_id?: string; date?: string; days_back?: number } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body (cron trigger)
    }

    // FIX A2: Use 3-day rolling sync by default to catch missed days.
    // If a specific date is provided (manual sync), use that instead.
    // FIX: Support days_back param for historical backfill (max 30 days).
    const daysBack = Math.min(body.days_back || 3, 30);
    const syncDates = body.date ? [body.date] : getLastNDays(daysBack);
    const dateStart = syncDates[syncDates.length - 1]; // oldest
    const dateEnd = syncDates[0]; // most recent (yesterday)
    const syncDate = dateEnd; // for backwards compat in response

    // ⚠️ Use ADMIN client (SERVICE_ROLE_KEY) to bypass RLS
    const supabase = createAdminClient();

    // Get active connections to sync
    let connectionQuery = supabase
      .from("meta_connections")
      .select("*")
      .eq("is_active", true)
      .eq("auto_sync", true);

    if (body.connection_id) {
      connectionQuery = connectionQuery.eq("id", body.connection_id);
    } else if (userId) {
      connectionQuery = connectionQuery.eq("user_id", userId);
    }

    const { data: connectionsRaw, error: connError } = await connectionQuery;
    if (connError) throw connError;

    const connections = (connectionsRaw as unknown as MetaConnection[]) || [];

    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active Meta connections to sync",
        synced: 0,
      });
    }

    const results = [];

    for (const conn of connections) {
      try {
        // Check if token expired
        if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
          await supabase
            .from("meta_connections")
            .update({
              last_sync_status: "error",
              last_sync_error: "Token expired. Please reconnect Meta account.",
              token_status: "invalid",
            } as never)
            .eq("id", conn.id);

          results.push({ connection_id: conn.id, status: "error", error: "token_expired" });
          continue;
        }

        // ──────────────────────────────────────────────────────────────
        // FIX: Reset stale error status from previous failed syncs.
        // If the token hasn't expired, clear "invalid"/"token_invalid"
        // status so the UI doesn't permanently disable Sync Now.
        // ──────────────────────────────────────────────────────────────
        if (conn.token_expires_at && new Date(conn.token_expires_at) > new Date()) {
          // Token is still valid — clear any stale error flags
          const connAny = conn as unknown as Record<string, unknown>;
          const staleStatus = connAny.token_status === "invalid" ||
            connAny.last_sync_status === "token_invalid";
          if (staleStatus) {
            console.log(`[Sync] 🧹 Clearing stale token_invalid status for ${conn.id} (token valid until ${conn.token_expires_at})`);
            await supabase
              .from("meta_connections")
              .update({
                token_status: "active",
                last_sync_status: "syncing",
                last_sync_error: null,
              } as never)
              .eq("id", conn.id);
          }
        }

        // ──────────────────────────────────────────────────────────────
        // FIX A4: Auto-refresh token if within 7 days of expiry
        // ──────────────────────────────────────────────────────────────
        let accessToken = conn.access_token;
        if (shouldRefreshToken(conn.token_expires_at)) {
          try {
            console.log(`[Sync] 🔄 Token expiring soon (${conn.token_expires_at}), refreshing...`);
            const refreshed = await refreshLongLivedToken(accessToken);
            const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

            await supabase
              .from("meta_connections")
              .update({
                access_token: refreshed.access_token,
                token_expires_at: newExpiry,
              } as never)
              .eq("id", conn.id);

            accessToken = refreshed.access_token;
            console.log(`[Sync] ✅ Token refreshed, new expiry: ${newExpiry}`);
          } catch (refreshErr) {
            console.warn(`[Sync] ⚠️ Token refresh failed:`, refreshErr instanceof Error ? refreshErr.message : refreshErr);
            // Continue with existing token — it may still work for a few more days
          }
        }

        // ====================================================================
        // PHASE 1: ALWAYS sync ad accounts from Meta (not just when empty)
        // ====================================================================
        let autoImportedCount = 0;
        let nameMatchedCount = 0;

        try {
          console.log(`[Sync] Phase 1: Syncing ad accounts from Meta...`);

          // 1a. Fetch ALL accounts from Business Portfolio + personal
          let metaAdAccounts: Array<{
            id: string;
            account_id: string;
            name: string;
            account_status: number;
            currency: string;
            timezone_name: string;
          }> = [];

          // FIX B2: Track [190] errors — if ALL API calls fail with [190],
          // the token is invalid and we should mark it immediately.
          let tokenInvalidError: string | null = null;

          // Try Business Portfolio (BM) - gets all managed accounts
          try {
            console.log(`[Sync] Querying Business Portfolio ${HADONA_BM_ID}...`);
            metaAdAccounts = await getBusinessAdAccounts(HADONA_BM_ID, accessToken);
            console.log(`[Sync] ✅ Got ${metaAdAccounts.length} accounts from BM`);
          } catch (bmErr) {
            const bmErrMsg = bmErr instanceof Error ? bmErr.message : String(bmErr);
            console.warn(`[Sync] ⚠️ BM query failed, falling back to personal:`, bmErrMsg);
            if (bmErrMsg.includes("[190]") || bmErrMsg.includes("190")) {
              tokenInvalidError = bmErrMsg;
            }
          }

          // Merge BM + personal (dedup by account_id)
          try {
            const personalAccounts = await getAdAccounts(accessToken);
            const existingIds = new Set(metaAdAccounts.map((a) => a.account_id));
            for (const pa of personalAccounts) {
              if (!existingIds.has(pa.account_id)) {
                metaAdAccounts.push(pa);
              }
            }
            console.log(`[Sync] Total unique accounts after merge: ${metaAdAccounts.length}`);
          } catch (personalErr) {
            const personalErrMsg = personalErr instanceof Error ? personalErr.message : String(personalErr);
            console.warn(`[Sync] ⚠️ Personal accounts fetch failed:`, personalErrMsg);
            if (personalErrMsg.includes("[190]") || personalErrMsg.includes("190")) {
              tokenInvalidError = personalErrMsg;
            }
          }

          // FIX B2: If token is invalid [190], skip everything and mark connection
          if (tokenInvalidError && metaAdAccounts.length === 0) {
            console.error(`[Sync] 🔴 Token INVALID [190] for connection ${conn.id}. Marking as token_invalid.`);
            await supabase
              .from("meta_connections")
              .update({
                last_sync_status: "token_invalid",
                last_sync_error: "Token invalid atau expired (Error 190). Klik 'Reconnect Meta' untuk menyambungkan ulang.",
                token_status: "invalid",
              } as never)
              .eq("id", conn.id);

            results.push({
              connection_id: conn.id,
              fb_user: conn.fb_user_name,
              status: "token_invalid",
              error: "Token invalid [190] — reconnect required",
            });
            continue; // Skip to next connection
          }

          // 1b. Fetch ALL existing META accounts from DB (ONE query)
          const { data: existingAccountsRaw, error: fetchErr } = await supabase
            .from("ad_accounts")
            .select("id, ad_account_id, account_name, client_id")
            .eq("platform", "META");

          if (fetchErr) {
            console.error(`[Sync] ❌ Failed to fetch existing accounts:`, fetchErr.message);
          }

          const existingAccounts = (existingAccountsRaw as unknown as ExistingAcc[]) || [];

          // Build lookup maps for fast matching
          const existingByMetaId = new Map<string, ExistingAcc>();
          const existingByName = new Map<string, ExistingAcc>();

          for (const acc of existingAccounts) {
            // Only add to "byMetaId" if it has a real ID (not UNKNOWN-XX)
            if (acc.ad_account_id && !acc.ad_account_id.startsWith("UNKNOWN-")) {
              existingByMetaId.set(acc.ad_account_id, acc);
            }
            if (acc.account_name) {
              existingByName.set(acc.account_name.toLowerCase(), acc);
            }
          }

          console.log(
            `[Sync] DB has ${existingAccounts.length} META accounts (${existingByMetaId.size} with real IDs, ${existingAccounts.length - existingByMetaId.size} UNKNOWN)`
          );

          // 1c. Process each Meta account from BM
          for (const metaAcc of metaAdAccounts) {
            // FIX: Do NOT skip inactive accounts!
            // Status 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED
            // We want to sync ALL accounts (including off/paused clients)
            // Meta API still returns historical insights for inactive accounts.

            const realId = metaAcc.account_id;

            // Check 1: Already exists by real Meta ID?
            if (existingByMetaId.has(realId)) {
              const existing = existingByMetaId.get(realId)!;
              // Ensure it's linked to this connection
              const { error: updErr } = await supabase
                .from("ad_accounts")
                .update({
                  meta_connection_id: conn.id,
                  meta_sync_enabled: true,
                  account_name: metaAcc.name,
                  currency: metaAcc.currency,
                  timezone: metaAcc.timezone_name,
                } as never)
                .eq("id", existing.id);

              if (updErr) {
                console.error(`[Sync] ❌ Update failed for ${realId}:`, updErr.message);
              }
              continue;
            }

            // Check 2: Exists by NAME? (for accounts imported from Google Sheet with UNKNOWN-XX ID)
            if (metaAcc.name && existingByName.has(metaAcc.name.toLowerCase())) {
              const existing = existingByName.get(metaAcc.name.toLowerCase())!;
              console.log(
                `[Sync] 🔄 Name match: "${metaAcc.name}" → updating ${existing.ad_account_id} → ${realId}`
              );

              // UPDATE: Replace UNKNOWN-XX with real Meta ID
              const { error: updErr } = await supabase
                .from("ad_accounts")
                .update({
                  ad_account_id: realId,
                  meta_connection_id: conn.id,
                  meta_sync_enabled: true,
                  account_name: metaAcc.name,
                  currency: metaAcc.currency,
                  timezone: metaAcc.timezone_name,
                } as never)
                .eq("id", existing.id);

              if (updErr) {
                console.error(`[Sync] ❌ Name-match update failed for "${metaAcc.name}":`, updErr.message);
              } else {
                nameMatchedCount++;
              }
              // Update maps so we don't match again
              existingByMetaId.set(realId, existing);
              continue;
            }

            // Check 3: Create new account
            const { data: newAccRaw, error: insertErr } = await supabase
              .from("ad_accounts")
              .insert({
                ad_account_id: realId,
                platform: "META",
                account_name: metaAcc.name,
                currency: metaAcc.currency,
                timezone: metaAcc.timezone_name,
                meta_connection_id: conn.id,
                meta_sync_enabled: true,
                status: "active",
              } as never)
              .select("id, ad_account_id, client_id")
              .single();

            const newAcc = newAccRaw as unknown as MetaAdAccount | null;
            if (newAcc) {
              autoImportedCount++;
              existingByMetaId.set(realId, { ...newAcc, account_name: metaAcc.name });
            } else if (insertErr) {
              console.error(`[Sync] ❌ Insert failed for ${realId}:`, insertErr.message);
            }
          }

          console.log(
            `[Sync] ✅ Phase 1 done: ${autoImportedCount} new, ${nameMatchedCount} name-matched (UNKNOWN→real ID)`
          );
        } catch (e) {
          console.error(`[Sync] Failed to sync ad accounts from Meta:`, e);
        }

        // ====================================================================
        // PHASE 2: Get all syncable accounts and pull insights
        // ====================================================================

        // Get all syncable accounts (ONLY those with REAL Meta IDs, skip UNKNOWN-XX)
        const { data: adAccountsRaw } = await supabase
          .from("ad_accounts")
          .select("id, ad_account_id, client_id")
          .eq("meta_connection_id", conn.id)
          .eq("meta_sync_enabled", true)
          .eq("platform", "META")
          .not("ad_account_id", "like", "UNKNOWN-%");

        const adAccounts = (adAccountsRaw as unknown as MetaAdAccount[]) || [];

        if (adAccounts.length === 0) {
          results.push({
            connection_id: conn.id,
            status: "skipped",
            reason: "No META ad accounts with real IDs after Phase 1",
            accounts_auto_imported: autoImportedCount,
            accounts_name_matched: nameMatchedCount,
          });
          continue;
        }

        let totalRecords = 0;
        const accountErrors: AccountError[] = [];
        let successCount = 0;
        let rateLimitedCount = 0;

        console.log(`[Sync] Phase 2: Pulling insights for ${adAccounts.length} accounts via Batch API (${dateStart} → ${dateEnd})...`);

        // ──────────────────────────────────────────────────────────────
        // FIX A3: Use Batch API (50 accounts per call) instead of
        //         individual calls with 300ms delays.
        // This reduces sync time from ~30s (10 accounts) to ~2s.
        // ──────────────────────────────────────────────────────────────
        let batchInsightsMap: Record<string, AdInsightWithActionValues[]> = {};
        try {
          const batchAccounts = adAccounts.map((a) => ({ id: a.id, adAccountId: a.ad_account_id }));
          batchInsightsMap = await getBatchInsights(accessToken, batchAccounts, dateStart, dateEnd) as Record<string, AdInsightWithActionValues[]>;
          console.log(`[Sync] ✅ Batch API completed for ${Object.keys(batchInsightsMap).length} accounts`);
        } catch (batchErr) {
          const batchErrMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
          console.error(`[Sync] ❌ Batch API failed, falling back to individual calls:`, batchErrMsg);

          // FIX B2: If batch fails with [190], token is invalid — mark and skip
          if (batchErrMsg.includes("[190]") || batchErrMsg.includes("190")) {
            console.error(`[Sync] 🔴 Batch API Error [190] — Token invalid for connection ${conn.id}`);
            await supabase
              .from("meta_connections")
              .update({
                last_sync_status: "token_invalid",
                last_sync_error: "Token invalid atau expired (Error 190). Klik 'Reconnect Meta' untuk menyambungkan ulang.",
                token_status: "invalid",
              } as never)
              .eq("id", conn.id);

            results.push({
              connection_id: conn.id,
              fb_user: conn.fb_user_name,
              status: "token_invalid",
              error: "Token invalid [190] — reconnect required",
            });
            continue;
          }

          // Fallback: individual calls with retry
          for (let i = 0; i < adAccounts.length; i++) {
            const account = adAccounts[i];
            if (i > 0) await sleep(300);

            const { data: insights, error: apiError } = await getInsightsWithRetry(
              accessToken,
              account.ad_account_id,
              dateStart,
              dateEnd
            );

            if (apiError) {
              accountErrors.push({ id: account.ad_account_id, error: apiError });
              continue;
            }
            batchInsightsMap[account.ad_account_id] = insights as AdInsightWithActionValues[];
          }
        }

        // Process insights from batch results
        for (const account of adAccounts) {
          const insights = batchInsightsMap[account.ad_account_id] || [];

          if (insights.length === 0) continue;

          let hasDbError = false;
          for (const insight of insights) {
            const conversions = extractConversions(insight.actions);
            const spend = parseFloat(insight.spend) || 0;
            const impressions = parseInt(insight.impressions) || 0;
            const clicks = parseInt(insight.clicks) || 0;

            if (spend === 0 && impressions === 0) continue;

            // FIX A5: Extract revenue from Pixel action_values
            const revenue = extractRevenue(insight.actions, insight.action_values);

            const { error: logError } = await supabase
              .from("ad_spend_logs")
              .upsert(
                {
                  ad_account_id: account.id,
                  log_date: insight.date_start,
                  spend,
                  impressions,
                  clicks,
                  conversions,
                  revenue,
                  notes: "Auto-synced from Meta API (Batch)",
                } as never,
                {
                  onConflict: "ad_account_id,log_date",
                }
              );

            if (logError) {
              console.error(`[Sync] ❌ DB error for ${account.ad_account_id}:`, logError.message);
              hasDbError = true;
            } else {
              totalRecords++;
            }
          }

          if (hasDbError) {
            accountErrors.push({ id: account.ad_account_id, error: "Database upsert failed" });
          } else {
            successCount++;
          }

          // Log sync record
          await supabase.from("meta_sync_logs").insert({
            connection_id: conn.id,
            ad_account_id: account.id,
            sync_date: syncDate,
            records_pulled: insights.length,
            status: "success",
          } as never);
        }

        console.log(
          `[Sync] ✅ Phase 2 done: ${successCount} success, ${accountErrors.length} errors (${rateLimitedCount} rate-limited), ${totalRecords} records`
        );

        // Update connection sync status
        const status =
          accountErrors.length === adAccounts.length
            ? "error"
            : accountErrors.length > 0
              ? "partial"
              : "success";

        // Format error summary: top 5 errors with reasons
        const errorSummary =
          accountErrors.length > 0
            ? `${accountErrors.length} failed: ` +
              accountErrors
                .slice(0, 5)
                .map((e) => `${e.id} (${e.error.slice(0, 50)})`)
                .join(", ") +
              (accountErrors.length > 5 ? `... +${accountErrors.length - 5} more` : "")
            : null;

        await supabase
          .from("meta_connections")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: status,
            last_sync_error: errorSummary,
          } as never)
          .eq("id", conn.id);

        results.push({
          connection_id: conn.id,
          fb_user: conn.fb_user_name,
          status,
          records_synced: totalRecords,
          accounts_auto_imported: autoImportedCount,
          accounts_name_matched: nameMatchedCount,
          total_ad_accounts: adAccounts.length,
          errors: accountErrors,
        });
      } catch (err) {
        console.error(`Error syncing connection ${conn.id}:`, err);
        results.push({
          connection_id: conn.id,
          status: "error",
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    const totalSuccessConnections = results.filter((r) => r.status === "success").length;
    const totalErrorConnections = results.filter((r) => r.status === "error").length;
    const grandTotalRecords = results.reduce((sum, r) => sum + (r.records_synced || 0), 0);
    const totalImported = results.reduce((sum, r) => sum + (r.accounts_auto_imported || 0), 0);
    const totalMatched = results.reduce((sum, r) => sum + (r.accounts_name_matched || 0), 0);

    return NextResponse.json({
      sync_method: "admin_client",
      success: true,
      date: syncDate,
      connections_synced: results.length,
      successful: totalSuccessConnections,
      errors: totalErrorConnections,
      total_records: grandTotalRecords,
      accounts_imported: totalImported,
      accounts_matched: totalMatched,
      details: results,
    });
  } catch (err) {
    console.error("Meta sync error:", err);
    return NextResponse.json(
      { error: "Sync failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meta/sync — For Vercel Cron (GET-based)
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Call POST logic by forwarding
  return POST(request);
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/**
 * FIX A2: Get last N days for rolling sync (handles missed days).
 * Meta insights data matures over 24-48h, so syncing 3 days ensures
 * we catch any gaps from failed cron runs.
 */
function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates; // [yesterday, day-before, ..., n-days-ago]
}

/** Backwards compat wrapper */
function getLast3Days(): string[] {
  return getLastNDays(3);
}
