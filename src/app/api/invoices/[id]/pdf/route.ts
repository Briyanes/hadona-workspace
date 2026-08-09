import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoicePDFDocument, type InvoicePDFData } from "@/lib/invoice-pdf";

// ============================================
// GET /api/invoices/[id]/pdf
// Generates a PDF invoice matching the "Invoice for Yourbestdeal" format
// ============================================

interface ContractInfo {
  tax_rate?: number | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  is_prepaid?: boolean | null;
  total_months_prepaid?: number | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    // Use select("*") to avoid errors if optional columns (billing_period, contract_billing_id)
    // don't exist yet in the database. Then separately fetch the client.
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found", detail: error?.message },
        { status: 404 }
      );
    }

    // Fetch client data separately
    const clientId = (invoice as Record<string, unknown>).client_id as string;
    let clientData: InvoicePDFData["client"] | undefined;
    if (clientId) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("name, email, phone, address")
        .eq("id", clientId)
        .single();
      if (clientRow) {
        clientData = clientRow as InvoicePDFData["client"];
      }
    }

    // Cast to record for flexible access
    const rawData = invoice as Record<string, unknown>;
    const billingId = rawData.contract_billing_id as string | null;

    // Fetch contract data for tax_rate, bank info, prepaid info + line items (Bug #1, #2, #6)
    let items: InvoicePDFData["items"] | undefined;
    let contractData: ContractInfo = {};

    if (billingId) {
      const { data: billing } = await supabase
        .from("contract_billings")
        .select(
          "services_snapshot, contract:client_contracts(tax_rate, bank_name, bank_account_name, bank_account_number, is_prepaid, total_months_prepaid)"
        )
        .eq("id", billingId)
        .single();

      const billingRow = billing as Record<string, unknown> | null;
      if (billingRow) {
        // Extract services snapshot
        const snapshot = billingRow.services_snapshot as
          | { service: string; fee: number }[]
          | null;
        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
          // For prepaid invoices, qty = total_months_prepaid (Bug #6)
          const rawContract2 = billingRow.contract;
          let isPrepaid = false;
          let prepaidMonths = 1;
          if (Array.isArray(rawContract2) && rawContract2.length > 0) {
            const c = rawContract2[0] as ContractInfo;
            isPrepaid = c?.is_prepaid ?? false;
            prepaidMonths = c?.total_months_prepaid ?? 1;
          } else if (rawContract2 && typeof rawContract2 === "object") {
            const c = rawContract2 as ContractInfo;
            isPrepaid = c?.is_prepaid ?? false;
            prepaidMonths = c?.total_months_prepaid ?? 1;
          }
          const qty = isPrepaid ? prepaidMonths : 1;
          items = snapshot.map((s) => ({
            description: s.service,
            qty,
            unit_price: s.fee,
            amount: s.fee * qty,
          }));
        }

        // Extract contract data — could be object or array from Supabase join
        const rawContract = billingRow.contract;
        if (Array.isArray(rawContract) && rawContract.length > 0) {
          contractData = (rawContract[0] as ContractInfo) || {};
        } else if (rawContract && typeof rawContract === "object") {
          contractData = rawContract as ContractInfo;
        }
      }
    }

    const pdfData: InvoicePDFData = {
      invoice_number: rawData.invoice_number as string,
      issue_date: rawData.issue_date as string,
      due_date: rawData.due_date as string,
      amount: Number(rawData.amount) || 0,
      tax: Number(rawData.tax) || 0,
      status: rawData.status as string,
      notes: (rawData.notes as string) || null,
      billing_period: (rawData.billing_period as string) || null,
      items,
      client: clientData,
      // Dynamic tax rate (Bug #1 fix)
      tax_rate: contractData.tax_rate ?? 11,
      // Bank details (Bug #2 fix)
      bank_name: contractData.bank_name ?? undefined,
      bank_account_name: contractData.bank_account_name ?? undefined,
      bank_account_number: contractData.bank_account_number ?? undefined,
      // Prepaid info (Bug #6 fix)
      is_prepaid: contractData.is_prepaid ?? false,
      prepaid_months: contractData.total_months_prepaid ?? undefined,
    };

    // Generate PDF
    const doc = createElement(InvoicePDFDocument, { invoice: pdfData });
    const pdfBuffer = await renderToBuffer(
      doc as unknown as React.ReactElement<Record<string, unknown>>
    );

    // Filename format: "Invoice for {Client} {DD.MM}.pdf"
    const clientName = clientData?.name || "Client";
    const datePart = new Date().toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
    });
    const filename = `Invoice for ${clientName} ${datePart}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate PDF: " + msg },
      { status: 500 }
    );
  }
}