import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdAccountInsights, extractConversions, getAdAccounts, getBusinessAdAccounts } from "@/lib/meta";

// Hadona's Business Portfolio ID
const HADONA_BM_ID = process.env.META_BUSINESS_ID || "1380114199447586";

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
    let body: { connection_id?: string; date?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body (cron trigger)
    }

    // Default: sync yesterday's data
    const syncDate = body.date || getYesterdayDate();

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
            } as never)
            .eq("id", conn.id);

          results.push({ connection_id: conn.id, status: "error", error: "token_expired" });
          continue;
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

          // Try Business Portfolio (BM) - gets all managed accounts
          try {
            console.log(`[Sync] Querying Business Portfolio ${HADONA_BM_ID}...`);
            metaAdAccounts = await getBusinessAdAccounts(HADONA_BM_ID, conn.access_token);
            console.log(`[Sync] ✅ Got ${metaAdAccounts.length} accounts from BM`);
          } catch (bmErr) {
            console.warn(`[Sync] ⚠️ BM query failed, falling back to personal:`, bmErr instanceof Error ? bmErr.message : bmErr);
          }

          // Merge BM + personal (dedup by account_id)
          try {
            const personalAccounts = await getAdAccounts(conn.access_token);
            const existingIds = new Set(metaAdAccounts.map((a) => a.account_id));
            for (const pa of personalAccounts) {
              if (!existingIds.has(pa.account_id)) {
                metaAdAccounts.push(pa);
              }
            }
            console.log(`[Sync] Total unique accounts after merge: ${metaAdAccounts.length}`);
          } catch {
            // Personal accounts fetch is optional
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
            // Skip if account_status is not active (1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED)
            if (metaAcc.account_status !== 1) continue;

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
                .upsert(
                  {
                    ad_account_id: account.id,
                    log_date: insight.date_start,
                    spend,
                    impressions,
                    clicks,
                    conversions,
                    revenue: 0, // Revenue not available from Meta API by default
                    notes: "Auto-synced from Meta API",
                  } as never,
                  {
                    onConflict: "ad_account_id,log_date",
                  }
                );

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

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;
    const totalRecords = results.reduce((sum, r) => sum + (r.records_synced || 0), 0);
    const totalImported = results.reduce((sum, r) => sum + (r.accounts_auto_imported || 0), 0);
    const totalMatched = results.reduce((sum, r) => sum + (r.accounts_name_matched || 0), 0);

    return NextResponse.json({
      sync_method: "admin_client",
      success: true,
      date: syncDate,
      connections_synced: results.length,
      successful: successCount,
      errors: errorCount,
      total_records: totalRecords,
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