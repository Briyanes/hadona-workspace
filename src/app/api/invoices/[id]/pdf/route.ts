import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoicePDFDocument, type InvoicePDFData } from "@/lib/invoice-pdf";

// ============================================
// GET /api/invoices/[id]/pdf
// Generates a PDF invoice matching the "Invoice for Yourbestdeal" format
// ============================================
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(
        `
          id, invoice_number, issue_date, due_date, amount, tax, status,
          notes, billing_period, contract_billing_id,
          client:clients(name, email, phone, address)
        `
      )
      .eq("id", params.id)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Build PDF data
    const rawData = invoice as Record<string, unknown>;
    const clientData = (rawData.client as InvoicePDFData["client"]) || undefined;

    // Fetch line items from contract_billings.services_snapshot if linked
    let items: InvoicePDFData["items"] | undefined;
    const billingId = rawData.contract_billing_id as string | null;
    if (billingId) {
      const { data: billing } = await supabase
        .from("contract_billings")
        .select("services_snapshot")
        .eq("id", billingId)
        .single();
      const snapshot = (billing as Record<string, unknown> | null)?.services_snapshot as
        | { service: string; fee: number }[]
        | null;
      if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
        items = snapshot.map((s) => ({
          description: s.service,
          qty: 1,
          unit_price: s.fee,
          amount: s.fee,
        }));
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
    };

    // Generate PDF
    const doc = createElement(InvoicePDFDocument, { invoice: pdfData });
    const pdfBuffer = await renderToBuffer(doc as unknown as React.ReactElement<Record<string, unknown>>);

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