import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * /api/ad-accounts — Server-side handler that uses SERVICE ROLE KEY
 * to bypass RLS policies that block non-manager users from updating ad_accounts.
 *
 * Actions:
 *   POST { action: "bulk-assign", accountIds: string[], clientId: string, dailyBudget?, remainingBudget? }
 *   POST { action: "save", payload, editingId? }
 *   POST { action: "delete", accountId }
 *   POST { action: "toggle-sync", accountId, enabled }
 *   POST { action: "save-spend", payload }
 *   POST { action: "delete-spend", logId }
 */

// Admin client using service role key (bypasses RLS)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Verify user is authenticated via anon key cookie
async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (!token) return null;

  // Verify token via Supabase auth admin
  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function calcDaysLeft(remaining: number | null, daily: number | null): number | null {
  if (!remaining || !daily || daily <= 0) return null;
  return Math.floor(remaining / daily);
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    const supabase = getAdminClient();

    switch (action) {
      // ─── BULK ASSIGN ───
      case "bulk-assign": {
        const { accountIds, clientId, dailyBudget, remainingBudget } = body as {
          accountIds: string[];
          clientId: string;
          dailyBudget?: string;
          remainingBudget?: string;
        };

        if (!accountIds || accountIds.length === 0) {
          return NextResponse.json({ error: "Pilih minimal 1 akun" }, { status: 400 });
        }
        if (!clientId) {
          return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 });
        }

        const updates: Record<string, unknown> = { client_id: clientId };
        if (dailyBudget) updates.daily_budget = parseFloat(dailyBudget);
        if (remainingBudget) updates.remaining_budget = parseFloat(remainingBudget);
        if (dailyBudget && remainingBudget) {
          updates.days_left = calcDaysLeft(
            parseFloat(remainingBudget),
            parseFloat(dailyBudget)
          );
        }

        const { data, error } = await supabase
          .from("ad_accounts")
          .update(updates)
          .in("id", accountIds)
          .select("id, client_id");

        if (error) throw error;

        return NextResponse.json({
          success: true,
          updated: data?.length || accountIds.length,
          message: `${accountIds.length} akun berhasil di-assign!`,
        });
      }

      // ─── SAVE (CREATE / EDIT) ───
      case "save": {
        const { payload, editingId } = body as {
          payload: Record<string, unknown>;
          editingId?: string | null;
        };

        if (editingId) {
          const { data, error } = await supabase
            .from("ad_accounts")
            .update(payload)
            .eq("id", editingId)
            .select("id");
          if (error) throw error;
          return NextResponse.json({ success: true, action: "updated", id: editingId });
        } else {
          const { data, error } = await supabase
            .from("ad_accounts")
            .insert(payload)
            .select("id");
          if (error) throw error;
          return NextResponse.json({ success: true, action: "created", id: data?.[0]?.id });
        }
      }

      // ─── DELETE ───
      case "delete": {
        const { accountId } = body as { accountId: string };
        const { error } = await supabase.from("ad_accounts").delete().eq("id", accountId);
        if (error) throw error;
        return NextResponse.json({ success: true, action: "deleted" });
      }

      // ─── BULK DELETE ───
      case "bulk-delete": {
        const { accountIds } = body as { accountIds: string[] };

        if (!accountIds || accountIds.length === 0) {
          return NextResponse.json({ error: "Pilih minimal 1 akun" }, { status: 400 });
        }

        // ad_spend_logs has ON DELETE CASCADE, so logs auto-deleted
        const { data, error } = await supabase
          .from("ad_accounts")
          .delete()
          .in("id", accountIds)
          .select("id");

        if (error) throw error;

        return NextResponse.json({
          success: true,
          deleted: data?.length || accountIds.length,
          message: `${data?.length || accountIds.length} akun berhasil dihapus!`,
        });
      }

      // ─── TOGGLE SYNC ───
      case "toggle-sync": {
        const { accountId, enabled } = body as { accountId: string; enabled: boolean };
        const { error } = await supabase
          .from("ad_accounts")
          .update({ meta_sync_enabled: enabled })
          .eq("id", accountId);
        if (error) throw error;
        return NextResponse.json({ success: true, action: "toggled", enabled });
      }

      // ─── SAVE SPEND LOG ───
      case "save-spend": {
        const { payload } = body as { payload: Record<string, unknown> };
        const { data, error } = await supabase
          .from("ad_spend_logs")
          .upsert(payload, { onConflict: "ad_account_id,log_date" })
          .select("id");
        if (error) throw error;

        // Auto-update remaining budget
        if (payload.ad_account_id && payload.spend) {
          const { data: account } = await supabase
            .from("ad_accounts")
            .select("remaining_budget, daily_budget")
            .eq("id", payload.ad_account_id as string)
            .single();

          if (account) {
            const newRemaining =
              (account.remaining_budget || 0) - (payload.spend as number);
            await supabase
              .from("ad_accounts")
              .update({
                remaining_budget: Math.max(0, newRemaining),
                days_left: calcDaysLeft(
                  Math.max(0, newRemaining),
                  account.daily_budget
                ),
              })
              .eq("id", payload.ad_account_id as string);
          }
        }

        return NextResponse.json({ success: true, id: data?.[0]?.id });
      }

      // ─── DELETE SPEND LOG ───
      case "delete-spend": {
        const { logId } = body as { logId: string };
        const { error } = await supabase.from("ad_spend_logs").delete().eq("id", logId);
        if (error) throw error;
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/ad-accounts] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}