import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * GET /api/cron/auto-billing
 *
 * Cron job yang berjalan tanggal 1 setiap bulan.
 * Auto-generate billing untuk semua contract dengan status 'active'.
 *
 * Setup di Vercel Cron atau external cron (e.g., cron-job.org):
 *   0 1 1 * *  →  Tanggal 1, jam 01:00 UTC
 *
 * Atau via GitHub Actions schedule:
 *   on: { schedule: [{ cron: "0 1 1 * *" }] }
 *
 * Security: Uses CRON_SECRET env var to prevent unauthorized access.
 */

export async function GET(request: NextRequest) {
  // 🔒 Strict auth: fail-closed if CRON_SECRET not set or mismatched
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // Use service role to bypass RLS (cron has no user session)
  // Note: No Database generic — RPC functions are not typed in Database type
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    // Get current period (YYYY-MM)
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Find all active contracts
    const { data: activeContracts, error: fetchError } = await supabase
      .from("client_contracts")
      .select("id, contract_number, client_id, end_date, status, is_prepaid, total_months_prepaid, start_date")
      .eq("status", "active");

    if (fetchError) {
      console.error("[Auto-Billing] Failed to fetch active contracts:", fetchError.message);
      return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
    }

    if (!activeContracts || activeContracts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active contracts found",
        period: currentPeriod,
        generated: 0,
      });
    }

    type ActiveContract = {
      id: string;
      contract_number: string | null;
      client_id: string;
      end_date: string;
      status: string;
      is_prepaid: boolean | null;
      total_months_prepaid: number | null;
      start_date: string;
    };

    const results: { contract_id: string; contract_number: string | null; status: string; error?: string }[] = [];
    let generatedCount = 0;
    let skippedCount = 0;

    for (const contract of activeContracts as ActiveContract[]) {
      // Skip if contract has expired (end_date < first day of current month)
      const contractEndDate = new Date(contract.end_date);
      const periodStart = new Date(`${currentPeriod}-01`);
      if (contractEndDate < periodStart) {
        // Auto-update contract status to expired
        await supabase
          .from("client_contracts")
          .update({ status: "expired" })
          .eq("id", contract.id);
        results.push({
          contract_id: contract.id,
          contract_number: contract.contract_number,
          status: "skipped_expired",
        });
        skippedCount++;
        continue;
      }

      // ═══ PREPAID CHECK ═══
      // Skip if contract is prepaid and current period is still within prepaid months
      if (contract.is_prepaid && contract.total_months_prepaid && contract.total_months_prepaid > 0) {
        const contractStart = new Date(contract.start_date);
        const prepaidEndDate = new Date(contractStart);
        prepaidEndDate.setMonth(prepaidEndDate.getMonth() + contract.total_months_prepaid);

        if (periodStart < prepaidEndDate) {
          results.push({
            contract_id: contract.id,
            contract_number: contract.contract_number,
            status: "skipped_prepaid",
          });
          skippedCount++;
          continue;
        }
      }

      // Generate billing via RPC
      const { error: rpcError } = await supabase.rpc("generate_monthly_billing", {
        p_contract_id: contract.id,
        p_period: currentPeriod,
      } as never);

      if (rpcError) {
        console.error(`[Auto-Billing] Failed for ${contract.contract_number}:`, rpcError.message);
        results.push({
          contract_id: contract.id,
          contract_number: contract.contract_number,
          status: "error",
          error: rpcError.message,
        });
      } else {
        results.push({
          contract_id: contract.id,
          contract_number: contract.contract_number,
          status: "generated",
        });
        generatedCount++;
      }
    }


    return NextResponse.json({
      success: true,
      period: currentPeriod,
      total_contracts: activeContracts.length,
      generated: generatedCount,
      skipped: skippedCount,
      errors: results.filter((r) => r.status === "error").length,
      details: results,
    });
  } catch (err) {
    console.error("[Auto-Billing] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}