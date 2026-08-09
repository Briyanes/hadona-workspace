import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth-api";

/**
 * GET /api/dashboard/ae-analytics
 * AE-specific analytics: clients, contracts, MRR, invoices, meetings.
 * Returns data for AEAnalyticsWidget.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user || auth.error) return auth.error!;

    const { supabase } = auth;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const expiringThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // ── Parallel batch: all AE metrics ──
    const [clientsRes, contractsRes, mrrRes, invoicesRes, paidThisMonthRes, meetingsRes] = await Promise.all([
      // Total clients (active + onboarding)
      supabase
        .from("clients")
        .select("id, status")
        .in("status", ["active", "onboarding"]),

      // Active + expiring contracts
      supabase
        .from("client_contracts")
        .select("id, status, end_date")
        .eq("status", "active")
        .gte("end_date", today),

      // MRR from active contract_services (discount applied)
      supabase
        .from("contract_services")
        .select(`
          monthly_fee,
          contract:client_contracts!inner(status, end_date, discount_percent, client:clients!inner(status))
        `)
        .eq("status", "active")
        .eq("contract.status", "active")
        .gte("contract.end_date", today)
        .in("contract.client.status", ["active", "onboarding"]),

      // Pending/overdue invoices
      supabase
        .from("invoices")
        .select("id, status, due_date, amount, tax")
        .in("status", ["sent", "overdue", "pending"]),

      // Collected this month (paid invoices)
      supabase
        .from("invoices")
        .select("amount, tax")
        .eq("status", "paid")
        .gte("updated_at", monthStart)
        .lte("updated_at", monthEnd + "T23:59:59"),

      // Upcoming meetings (calendar_events from today forward)
      supabase
        .from("calendar_events")
        .select("id, start_datetime")
        .gte("start_datetime", today),
    ]);

    // ── Total Clients ──
    const totalClients = ((clientsRes.data as { id: string }[]) || []).length;

    // ── Active + Expiring Contracts ──
    interface ContractRow { id: string; status: string; end_date: string }
    const contractRows = (contractsRes.data as unknown as ContractRow[]) || [];
    const activeContracts = contractRows.length;
    const expiringContracts = contractRows.filter(
      (c) => c.end_date >= today && c.end_date <= expiringThreshold
    ).length;

    // ── Monthly Recurring Revenue (with discount) ──
    interface MrrRow {
      monthly_fee: number | null;
      contract: { discount_percent: number | null } | { discount_percent: number | null }[];
    }
    const mrrRows = (mrrRes.data as unknown as MrrRow[]) || [];
    const monthlyRecurring = mrrRows.reduce((sum, r) => {
      const fee = r.monthly_fee || 0;
      const contractData = Array.isArray(r.contract) ? r.contract[0] : r.contract;
      const disc = contractData?.discount_percent || 0;
      return sum + fee * (1 - disc / 100);
    }, 0);

    // ── Pending Invoices + Overdue Amount ──
    interface InvoiceRow {
      id: string;
      status: string;
      due_date: string | null;
      amount: number;
      tax: number;
    }
    const invoiceRows = (invoicesRes.data as unknown as InvoiceRow[]) || [];
    const pendingInvoices = invoiceRows.length;
    const overdueAmount = invoiceRows
      .filter((inv) => inv.due_date && inv.due_date < today && inv.status !== "paid")
      .reduce((sum, inv) => sum + (inv.amount || 0) + (inv.tax || 0), 0);

    // ── Collected This Month ──
    interface PaidRow { amount: number; tax: number }
    const paidRows = (paidThisMonthRes.data as unknown as PaidRow[]) || [];
    const collectedThisMonth = paidRows.reduce(
      (sum, inv) => sum + (inv.amount || 0) + (inv.tax || 0),
      0
    );

    // ── Upcoming Meetings ──
    const upcomingMeetings = ((meetingsRes.data as { id: string }[]) || []).length;

    return NextResponse.json({
      totalClients,
      activeContracts,
      expiringContracts,
      monthlyRecurring,
      pendingInvoices,
      overdueAmount,
      collectedThisMonth,
      upcomingMeetings,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "AE analytics fetch failed: " + msg }, { status: 500 });
  }
}