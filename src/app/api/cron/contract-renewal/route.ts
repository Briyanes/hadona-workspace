// ═══════════════════════════════════════════════════════════
// Cron: Contract Renewal Reminders
// Runs daily to check contracts expiring in 30/14/7 days
// Also marks contracts as expired and sends invoice overdue alerts
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient();
    const now = new Date();
    const results = { renewal30d: 0, renewal14d: 0, renewal7d: 0, expired: 0, overdue3d: 0, overdue7d: 0 };

    // ── 1. Contract Renewal: 30, 14, 7 days before expiry ──
    const { data: activeContracts } = await supabase
      .from("client_contracts")
      .select(`
        id, client_id, end_date, start_date, monthly_value,
        renewal_status, renewal_sent_at,
        client:clients(name)
      `)
      .eq("status", "active")
      .gte("end_date", now.toISOString());

    const contracts: AnyClient[] = (activeContracts as AnyClient[]) || [];

    for (const contract of contracts) {
      const endDate = new Date(contract.end_date as string);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const clientName: string = contract.client?.[0]?.name || contract.client?.name || "Client";
      const lastReminder: string | null = contract.renewal_sent_at || null;

      let notificationType: string | null = null;
      let shouldSend = false;

      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        notificationType = "contract_renewal_7d";
        shouldSend = !lastReminder || daysBetween(lastReminder, now) >= 3;
      } else if (daysUntilExpiry <= 14 && daysUntilExpiry > 7) {
        notificationType = "contract_renewal_14d";
        shouldSend = !lastReminder || daysBetween(lastReminder, now) >= 5;
      } else if (daysUntilExpiry <= 30 && daysUntilExpiry > 14) {
        notificationType = "contract_renewal_30d";
        shouldSend = !lastReminder;
      }

      if (shouldSend && notificationType) {
        // Find AE assigned to this client
        const { data: clientRow } = await supabase
          .from("clients")
          .select("assigned_to")
          .eq("id", contract.client_id as string)
          .single();
        const aeId = (clientRow as AnyClient)?.assigned_to ?? null;

        // Insert notification
        await supabase.from("notifications").insert({
          user_id: aeId,
          type: notificationType,
          title: `Contract Renewal: ${clientName}`,
          message: `Contract with ${clientName} expires in ${daysUntilExpiry} days (${endDate.toLocaleDateString("id-ID")}). Monthly value: Rp ${Number(contract.monthly_value || 0).toLocaleString("id-ID")}`,
          link: `/clients/${contract.client_id}`,
          metadata: { contract_id: contract.id, days_until_expiry: daysUntilExpiry },
        } as AnyClient);

        // Update renewal_sent_at and status
        await (supabase.from("client_contracts") as AnyClient)
          .update({
            renewal_sent_at: now.toISOString(),
            renewal_status: daysUntilExpiry <= 14 ? "expiring" : "active",
          })
          .eq("id", contract.id as string);

        // Log
        await supabase.from("contract_renewal_logs").insert({
          contract_id: contract.id,
          action: "reminder_sent",
          days_before_expiry: daysUntilExpiry,
        } as AnyClient);

        if (notificationType === "contract_renewal_30d") results.renewal30d++;
        else if (notificationType === "contract_renewal_14d") results.renewal14d++;
        else if (notificationType === "contract_renewal_7d") results.renewal7d++;
      }
    }

    // ── 2. Mark expired contracts ──
    const { data: expiredContracts } = await supabase
      .from("client_contracts")
      .select("id, client_id, client:clients(name)")
      .eq("status", "active")
      .lt("end_date", now.toISOString())
      .neq("renewal_status", "expired");

    for (const contract of (expiredContracts as AnyClient[]) || []) {
      const clientName: string = contract.client?.[0]?.name || contract.client?.name || "Client";

      await (supabase.from("client_contracts") as AnyClient)
        .update({ renewal_status: "expired", status: "expired" })
        .eq("id", contract.id as string);

      const { data: clientRow } = await supabase
        .from("clients")
        .select("assigned_to")
        .eq("id", contract.client_id as string)
        .single();

      await supabase.from("notifications").insert({
        user_id: (clientRow as AnyClient)?.assigned_to ?? null,
        type: "contract_renewal_expired",
        title: `Contract Expired: ${clientName}`,
        message: `Contract with ${clientName} has expired. Contact client for renewal.`,
        link: `/clients/${contract.client_id}`,
        metadata: { contract_id: contract.id },
      } as AnyClient);

      await supabase.from("contract_renewal_logs").insert({
        contract_id: contract.id,
        action: "expired",
      } as AnyClient);

      results.expired++;
    }

    // ── 3. Invoice overdue reminders (3d and 7d) ──
    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, due_date, amount, client_id, reminder_count, client:clients(name)")
      .eq("status", "sent")
      .lt("due_date", now.toISOString());

    for (const inv of (overdueInvoices as AnyClient[]) || []) {
      const dueDate = new Date(inv.due_date as string);
      const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount: number = inv.reminder_count || 0;
      const clientName: string = inv.client?.[0]?.name || inv.client?.name || "Client";

      if (daysOverdue >= 7 && reminderCount < 2) {
        await sendInvoiceOverdueNotification(supabase, inv, clientName, "invoice_overdue_7d", daysOverdue);
        await updateInvoiceReminder(supabase, inv.id as string, 2);
        results.overdue7d++;
      } else if (daysOverdue >= 3 && reminderCount < 1) {
        await sendInvoiceOverdueNotification(supabase, inv, clientName, "invoice_overdue_3d", daysOverdue);
        await updateInvoiceReminder(supabase, inv.id as string, 1);
        results.overdue3d++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: results,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Cron failed: " + msg }, { status: 500 });
  }
}

// ── Helpers ──
function daysBetween(fromISO: string, to: Date): number {
  return Math.ceil((to.getTime() - new Date(fromISO).getTime()) / (1000 * 60 * 60 * 24));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendInvoiceOverdueNotification(supabase: AnyClient, invoice: AnyClient, clientName: string, type: string, daysOverdue: number) {
  const { data: clientRow } = await supabase
    .from("clients")
    .select("assigned_to")
    .eq("id", invoice.client_id as string)
    .single();

  await supabase.from("notifications").insert({
    user_id: clientRow?.assigned_to ?? null,
    type,
    title: `Invoice Overdue: ${invoice.invoice_number}`,
    message: `Invoice ${invoice.invoice_number} for ${clientName} is ${daysOverdue} days overdue. Amount: Rp ${Number(invoice.amount || 0).toLocaleString("id-ID")}`,
    link: `/invoices`,
    metadata: { invoice_id: invoice.id },
  } as AnyClient);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateInvoiceReminder(supabase: AnyClient, invoiceId: string, count: number) {
  await supabase
    .from("invoices")
    .update({ reminder_sent_at: new Date().toISOString(), reminder_count: count } as AnyClient)
    .eq("id", invoiceId);
}