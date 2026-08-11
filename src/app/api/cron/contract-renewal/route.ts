// ═══════════════════════════════════════════════════════════
// Cron: Contract Renewal Reminders
// Runs daily to check contracts expiring in 30/14/7 days
// Also marks contracts as expired and sends invoice overdue alerts
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // 🔒 Strict auth: fail-closed if CRON_SECRET not set or mismatched
  const authError = verifyCronSecret(req);
  if (authError) return authError;

  // Use service role to bypass RLS (cron has no user session)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    const now = new Date();
    const results = { renewal30d: 0, renewal14d: 0, renewal7d: 0, expired: 0, overdue3d: 0, overdue7d: 0 };

    // ═══ 1. Contract Renewal: 30, 14, 7 days before expiry ═══
    const { data: activeContracts } = await supabase
      .from("client_contracts")
      .select(`
        id, client_id, end_date, start_date, monthly_value,
        renewal_status, renewal_sent_at,
        client:clients(name)
      `)
      .eq("status", "active")
      .gte("end_date", now.toISOString());

    type ContractRow = {
      id: string;
      client_id: string;
      end_date: string;
      start_date: string;
      monthly_value: number | null;
      renewal_status: string | null;
      renewal_sent_at: string | null;
      client: { name: string } | { name: string }[];
    };

    for (const contract of (activeContracts as ContractRow[]) || []) {
      const endDate = new Date(contract.end_date);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const clientName: string = Array.isArray(contract.client)
        ? contract.client[0]?.name || "Client"
        : contract.client?.name || "Client";

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
        const { data: clientRow } = await supabase
          .from("clients")
          .select("assigned_to")
          .eq("id", contract.client_id)
          .single();
        const aeId = clientRow?.assigned_to ?? null;

        await supabase.from("notifications").insert({
          user_id: aeId,
          type: notificationType,
          title: `Contract Renewal: ${clientName}`,
          message: `Contract with ${clientName} expires in ${daysUntilExpiry} days (${endDate.toLocaleDateString("id-ID")}). Monthly value: Rp ${Number(contract.monthly_value || 0).toLocaleString("id-ID")}`,
          link: `/clients/${contract.client_id}`,
          metadata: { contract_id: contract.id, days_until_expiry: daysUntilExpiry },
        });

        await supabase
          .from("client_contracts")
          .update({
            renewal_sent_at: now.toISOString(),
            renewal_status: daysUntilExpiry <= 14 ? "expiring" : "active",
          })
          .eq("id", contract.id);

        await supabase.from("contract_renewal_logs").insert({
          contract_id: contract.id,
          action: "reminder_sent",
          days_before_expiry: daysUntilExpiry,
        });

        if (notificationType === "contract_renewal_30d") results.renewal30d++;
        else if (notificationType === "contract_renewal_14d") results.renewal14d++;
        else if (notificationType === "contract_renewal_7d") results.renewal7d++;
      }
    }

    // ═══ 2. Mark expired contracts ═══
    const { data: expiredContracts } = await supabase
      .from("client_contracts")
      .select("id, client_id, client:clients(name)")
      .eq("status", "active")
      .lt("end_date", now.toISOString())
      .neq("renewal_status", "expired");

    for (const contract of (expiredContracts as ContractRow[]) || []) {
      const clientName: string = Array.isArray(contract.client)
        ? contract.client[0]?.name || "Client"
        : contract.client?.name || "Client";

      await supabase
        .from("client_contracts")
        .update({ renewal_status: "expired", status: "expired" })
        .eq("id", contract.id);

      const { data: clientRow } = await supabase
        .from("clients")
        .select("assigned_to")
        .eq("id", contract.client_id)
        .single();

      await supabase.from("notifications").insert({
        user_id: clientRow?.assigned_to ?? null,
        type: "contract_renewal_expired",
        title: `Contract Expired: ${clientName}`,
        message: `Contract with ${clientName} has expired. Contact client for renewal.`,
        link: `/clients/${contract.client_id}`,
        metadata: { contract_id: contract.id },
      });

      await supabase.from("contract_renewal_logs").insert({
        contract_id: contract.id,
        action: "expired",
      });

      results.expired++;
    }

    // ═══ 3. Invoice overdue reminders (3d and 7d) ═══
    const { data: overdueInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, due_date, amount, client_id, reminder_count, client:clients(name)")
      .eq("status", "sent")
      .lt("due_date", now.toISOString());

    type InvoiceRow = {
      id: string;
      invoice_number: string;
      due_date: string;
      amount: number | null;
      client_id: string;
      reminder_count: number | null;
      client: { name: string } | { name: string }[];
    };

    for (const inv of (overdueInvoices as InvoiceRow[]) || []) {
      const dueDate = new Date(inv.due_date);
      const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const reminderCount: number = inv.reminder_count || 0;
      const clientName: string = Array.isArray(inv.client)
        ? inv.client[0]?.name || "Client"
        : inv.client?.name || "Client";

      if (daysOverdue >= 7 && reminderCount < 2) {
        // Send 7-day overdue notification
        const { data: invClientRow } = await supabase
          .from("clients")
          .select("assigned_to")
          .eq("id", inv.client_id)
          .single();

        await supabase.from("notifications").insert({
          user_id: invClientRow?.assigned_to ?? null,
          type: "invoice_overdue_7d",
          title: `Invoice Overdue: ${inv.invoice_number}`,
          message: `Invoice ${inv.invoice_number} for ${clientName} is ${daysOverdue} days overdue. Amount: Rp ${Number(inv.amount || 0).toLocaleString("id-ID")}`,
          link: `/invoices`,
          metadata: { invoice_id: inv.id },
        });

        await supabase
          .from("invoices")
          .update({ reminder_sent_at: new Date().toISOString(), reminder_count: 2 })
          .eq("id", inv.id);

        results.overdue7d++;
      } else if (daysOverdue >= 3 && reminderCount < 1) {
        // Send 3-day overdue notification
        const { data: invClientRow } = await supabase
          .from("clients")
          .select("assigned_to")
          .eq("id", inv.client_id)
          .single();

        await supabase.from("notifications").insert({
          user_id: invClientRow?.assigned_to ?? null,
          type: "invoice_overdue_3d",
          title: `Invoice Overdue: ${inv.invoice_number}`,
          message: `Invoice ${inv.invoice_number} for ${clientName} is ${daysOverdue} days overdue. Amount: Rp ${Number(inv.amount || 0).toLocaleString("id-ID")}`,
          link: `/invoices`,
          metadata: { invoice_id: inv.id },
        });

        await supabase
          .from("invoices")
          .update({ reminder_sent_at: new Date().toISOString(), reminder_count: 1 })
          .eq("id", inv.id);

        results.overdue3d++;
      }
    }


    return NextResponse.json({
      success: true,
      processed: results,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[Contract-Renewal] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Cron failed: " + msg }, { status: 500 });
  }
}

function daysBetween(fromISO: string, to: Date): number {
  return Math.ceil((to.getTime() - new Date(fromISO).getTime()) / (1000 * 60 * 60 * 24));
}