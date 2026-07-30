import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdAccountInsights, extractConversions, getAdAccounts, getBusinessAdAccounts } from "@/lib/meta";

// Hadona's Business Portfolio ID
const HADONA_BM_ID = process.env.META_BUSINESS_ID || "1380114199447586";

interface MetaConnection {
  id: string;
  user_id: string;
  fb_user_id: string;
  fb_user_name: string | null;
  access_token: string;
  token_expires_at: string | null;
  is_active: boolean;
  auto_sync: boolean;
}

interface MetaAdAccount {
  id: string;
  ad_account_id: string;
  client_id: string | null;
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
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  try {
    let body: { connection_id?: string; date?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body (cron trigger)
    }

    // Default: sync yesterday's data
    const syncDate = body.date || getYesterdayDate();

    const supabase = createClient();

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
            } as never)
            .eq("id", conn.id);

          results.push({ connection_id: conn.id, status: "error", error: "token_expired" });
          continue;
        }

        // Get all ad_accounts linked to this connection
        const { data: adAccountsRaw } = await supabase
          .from("ad_accounts")
          .select("id, ad_account_id, client_id")
          .eq("meta_connection_id", conn.id)
          .eq("meta_sync_enabled", true)
          .eq("platform", "META");

        let adAccounts = (adAccountsRaw as unknown as MetaAdAccount[]) || [];
        let autoImportedCount = 0;

        // STEP: Auto-import ad accounts from Meta if none are linked yet
        if (adAccounts.length === 0) {
          console.log(`[Sync] No linked ad accounts found. Auto-importing from Meta...`);
          try {
            // Strategy: Try Business Portfolio first (gets ALL 41+ accounts),
            // fallback to personal accounts if BM query fails
            let metaAdAccounts: Array<{
              id: string;
              account_id: string;
              name: string;
              account_status: number;
              currency: string;
              timezone_name: string;
            }> = [];

            // 1. Try Business Portfolio (BM) - gets all managed accounts
            try {
              console.log(`[Sync] Querying Business Portfolio ${HADONA_BM_ID}...`);
              metaAdAccounts = await getBusinessAdAccounts(HADONA_BM_ID, conn.access_token);
              console.log(`[Sync] ✅ Got ${metaAdAccounts.length} accounts from BM`);
            } catch (bmErr) {
              console.warn(`[Sync] ⚠️ BM query failed, falling back to personal:`, bmErr instanceof Error ? bmErr.message : bmErr);
            }

            // 2. Fallback: Get personal ad accounts
            if (metaAdAccounts.length === 0) {
              console.log(`[Sync] Falling back to personal ad accounts...`);
              metaAdAccounts = await getAdAccounts(conn.access_token);
              console.log(`[Sync] Got ${metaAdAccounts.length} personal accounts`);
            }

            // 3. Merge: Combine BM + personal accounts (dedup by account_id)
            try {
              const personalAccounts = await getAdAccounts(conn.access_token);
              const existingIds = new Set(metaAdAccounts.map(a => a.account_id));
              for (const pa of personalAccounts) {
                if (!existingIds.has(pa.account_id)) {
                  metaAdAccounts.push(pa);
                }
              }
              console.log(`[Sync] Total unique accounts after merge: ${metaAdAccounts.length}`);
            } catch {
              // Personal accounts fetch is optional, BM data is primary
            }

            for (const metaAcc of metaAdAccounts) {
              // Skip if account_status is not active (1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED)
              if (metaAcc.account_status !== 1) continue;

              // Check if already exists (by ad_account_id + platform)
              const { data: existingRaw } = await supabase
                .from("ad_accounts")
                .select("id, ad_account_id, client_id")
                .eq("ad_account_id", metaAcc.account_id)
                .eq("platform", "META")
                .maybeSingle();

              const existing = existingRaw as unknown as MetaAdAccount | null;

              if (existing) {
                // Link it
                await supabase
                  .from("ad_accounts")
                  .update({
                    meta_connection_id: conn.id,
                    meta_sync_enabled: true,
                  } as never)
                  .eq("id", existing.id);
                adAccounts.push(existing);
                autoImportedCount++;
              } else {
                // Create new
                const { data: newAccRaw } = await supabase
                  .from("ad_accounts")
                  .insert({
                    ad_account_id: metaAcc.account_id,
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
                  adAccounts.push(newAcc);
                  autoImportedCount++;
                }
              }
            }

            console.log(`[Sync] Auto-imported ${autoImportedCount} ad accounts`);
          } catch (e) {
            console.error(`[Sync] Failed to auto-import ad accounts:`, e);
          }
        }

        if (adAccounts.length === 0) {
          results.push({
            connection_id: conn.id,
            status: "skipped",
            reason: "No active META ad accounts found after auto-import",
          });
          continue;
        }

        let totalRecords = 0;
        const accountErrors: string[] = [];

        for (const account of adAccounts) {
          try {
            // Pull insights from Meta API
            const insights = await getAdAccountInsights(
              conn.access_token,
              account.ad_account_id,
              syncDate,
              syncDate
            );

            if (insights.length === 0) {
              // No spend data for this date (account might be inactive)
              continue;
            }

            // Upsert each day's insight to ad_spend_logs
            for (const insight of insights) {
              const conversions = extractConversions(insight.actions);
              const spend = parseFloat(insight.spend) || 0;
              const impressions = parseInt(insight.impressions) || 0;
              const clicks = parseInt(insight.clicks) || 0;

              if (spend === 0 && impressions === 0) continue;

              const { error: logError } = await supabase
                .from("ad_spend_logs")
                .upsert({
                  ad_account_id: account.id,
                  log_date: insight.date_start,
                  spend,
                  impressions,
                  clicks,
                  conversions,
                  revenue: 0, // Revenue not available from Meta API by default
                  notes: "Auto-synced from Meta API",
                } as never, {
                  onConflict: "ad_account_id,log_date",
                });

              if (logError) {
                console.error(`Error saving insight for ${account.ad_account_id}:`, logError);
                accountErrors.push(account.ad_account_id);
              } else {
                totalRecords++;
              }
            }

            // Log sync record
            await supabase.from("meta_sync_logs").insert({
              connection_id: conn.id,
              ad_account_id: account.id,
              sync_date: syncDate,
              records_pulled: insights.length,
              status: "success",
            } as never);
          } catch (err) {
            console.error(`Error syncing account ${account.ad_account_id}:`, err);
            accountErrors.push(account.ad_account_id);

            await supabase.from("meta_sync_logs").insert({
              connection_id: conn.id,
              ad_account_id: account.id,
              sync_date: syncDate,
              records_pulled: 0,
              status: "error",
              error_message: err instanceof Error ? err.message : "unknown",
            } as never);
          }
        }

        // Update connection sync status
        const status =
          accountErrors.length === adAccounts.length
            ? "error"
            : accountErrors.length > 0
              ? "partial"
              : "success";

        await supabase
          .from("meta_connections")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: status,
            last_sync_error:
              accountErrors.length > 0 ? `Failed accounts: ${accountErrors.join(", ")}` : null,
          } as never)
          .eq("id", conn.id);

        results.push({
          connection_id: conn.id,
          fb_user: conn.fb_user_name,
          status,
          records_synced: totalRecords,
          accounts_auto_imported: autoImportedCount,
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

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;
    const totalRecords = results.reduce((sum, r) => sum + (r.records_synced || 0), 0);

    return NextResponse.json({
      success: true,
      date: syncDate,
      connections_synced: results.length,
      successful: successCount,
      errors: errorCount,
      total_records: totalRecords,
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
 * Extract a 4-digit suffix from a string (e.g., "WL Arum 1529" → "1529")
 */
function extractSuffix(str: string | undefined | null): string | null {
  if (!str) return null;
  const match = str.match(/(\d{3,4})\s*$/);
  return match ? match[1] : null;
}

/**
 * Escape a string for use in Supabase PostgREST filter queries.
 */
function escapeForQuery(str: string): string {
  // PostgREST uses parentheses for OR filters, so escape them
  return str.replace(/[,()*]/g, " ").trim();
}
