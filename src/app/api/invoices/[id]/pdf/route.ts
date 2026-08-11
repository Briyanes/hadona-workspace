import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoicePDFDocument, type InvoicePDFData } from "@/lib/invoice-pdf";
import { createClient } from "@/lib/supabase/server";

// ============================================
// GET /api/invoices/[id]/pdf
// Generates a PDF invoice matching the "Invoice for Yourbestdeal" format
// ============================================

// ── Service name normalization (Bug #4 fix) ──
function normalizeServiceName(raw: string): string {
  const s = raw.trim();
  const lower = s.toLowerCase();

  // KOL variants → "KOL Management"
  if (lower === "kol" || lower.includes("kol management") || lower.includes("key opinion leader")) {
    return "KOL Management";
  }
  // Ads / Digital Advertising
  if (
    lower.includes("digital advertising") ||
    lower.includes("ads management") ||
    lower.includes("meta ads") ||
    lower.includes("advertising") ||
    lower === "ads"
  ) {
    return "Digital Advertising Management";
  }
  // Creative
  if (lower.includes("creative") || lower.includes("design")) {
    return "Creative Design";
  }
  // Social Media
  if (lower.includes("social media") || lower.includes("social media management") || lower === "smm") {
    return "Social Media Management";
  }
  // SEO
  if (lower.includes("seo") || lower.includes("search engine")) {
    return "Search Engine Optimization (SEO)";
  }
  // Content
  if (lower.includes("content")) {
    return "Content Production";
  }
  // Web Development
  if (lower.includes("web") || lower.includes("website") || lower.includes("development")) {
    return "Web Development";
  }
  // Default: return original with proper capitalization
  return s;
}

interface ContractInfo {
  tax_rate?: number | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  is_prepaid?: boolean | null;
  total_months_prepaid?: number | null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔒 AUTH CHECK: Verify user is authenticated before generating PDF
    const authSupabase = createClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Use service-role client to bypass RLS — ensures client data is always fetched
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // SINGLE QUERY with JOIN: Fetch invoice + client data in one shot.
    // The service-role key bypasses RLS for this JOIN too.
    // Note: Using explicit column list instead of "*" to ensure the JOIN works reliably.
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*, client:clients(name)")
      .eq("id", params.id)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found", detail: error?.message },
        { status: 404 }
      );
    }

    // Cast to record for flexible access
    const rawData = invoice as Record<string, unknown>;
    const billingId = rawData.contract_billing_id as string | null;
    let clientId = rawData.client_id as string | null;

    // ── DEBUG MODE: Return raw data as JSON for troubleshooting ──
    const isDebug = req.nextUrl.searchParams.get("debug") === "json";
    if (isDebug) {
      // Fetch client data for debug
      let debugClient = null;
      let debugClientError = null;
      if (clientId) {
        const c = await supabase
          .from("clients")
          .select("id, name")
          .eq("id", clientId)
          .single();
        debugClient = c.data;
        debugClientError = c.error?.message || null;
      }
      return NextResponse.json({
        invoice_id: params.id,
        invoice_number: rawData.invoice_number,
        client_id: clientId,
        client_id_type: typeof clientId,
        billing_id: billingId,
        has_items: !!(rawData.items && Array.isArray(rawData.items) && rawData.items.length > 0),
        items_count: Array.isArray(rawData.items) ? rawData.items.length : 0,
        client_data_from_db: debugClient,
        client_query_error: debugClientError,
        env_service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        env_service_key_prefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) + "...",
        raw_client_id_value: rawData.client_id,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    // ── Extract client data (multi-level fallback) ──
    let clientData: InvoicePDFData["client"] | undefined;

    // Strategy 0 (HIGHEST PRIORITY): Client data from JOIN in the initial query
    // This was already fetched together with the invoice — no separate query needed.
    const rawClientFromJoin = rawData.client;
    if (rawClientFromJoin) {
      let clientRow: Record<string, unknown> | null = null;
      if (Array.isArray(rawClientFromJoin) && rawClientFromJoin.length > 0) {
        clientRow = rawClientFromJoin[0] as Record<string, unknown>;
      } else if (typeof rawClientFromJoin === "object") {
        clientRow = rawClientFromJoin as Record<string, unknown>;
      }
      if (clientRow && clientRow.name) {
        clientData = {
          name: clientRow.name as string,
          email: clientRow.email as string | undefined,
          phone: clientRow.phone as string | undefined,
          address: clientRow.address as string | undefined,
        };
      }
    }

    // Strategy 1: Separate query fallback (only if JOIN didn't return client data)
    if (!clientData && clientId) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .single();
      if (clientRow) {
        clientData = clientRow as InvoicePDFData["client"];
      }
    }

    // Strategy 2: If no client yet, try via contract_billing_id → contract → client
    let contractData: ContractInfo = {};
    let contractClientId: string | null = null;

    if (billingId) {
      const { data: billing } = await supabase
        .from("contract_billings")
        .select(
          `
          services_snapshot,
          contract:client_contracts(
            tax_rate, bank_name, bank_account_name, bank_account_number,
            is_prepaid, total_months_prepaid,
            client_id,
            client:clients(name)
          )
        `
        )
        .eq("id", billingId)
        .single();

      const billingRow = billing as Record<string, unknown> | null;
      if (billingRow) {
        // Extract contract data — could be object or array from Supabase join
        const rawContract = billingRow.contract;
        let contractObj: Record<string, unknown> | null = null;

        if (Array.isArray(rawContract) && rawContract.length > 0) {
          contractObj = rawContract[0] as Record<string, unknown>;
        } else if (rawContract && typeof rawContract === "object") {
          contractObj = rawContract as Record<string, unknown>;
        }

        if (contractObj) {
          contractData = contractObj as unknown as ContractInfo;
          contractClientId = (contractObj as Record<string, unknown>).client_id as string | null;

          // If clientData still missing, extract from contract join
          if (!clientData) {
            const rawClient = (contractObj as Record<string, unknown>).client;
            let clientRow: Record<string, unknown> | null = null;
            if (Array.isArray(rawClient) && rawClient.length > 0) {
              clientRow = rawClient[0] as Record<string, unknown>;
            } else if (rawClient && typeof rawClient === "object") {
              clientRow = rawClient as Record<string, unknown>;
            }
            if (clientRow) {
              clientData = {
                name: (clientRow.name as string) || "Client",
                email: clientRow.email as string | undefined,
                phone: clientRow.phone as string | undefined,
                address: clientRow.address as string | undefined,
              };
              clientId = contractClientId;
            }
          }
        }
      }
    }

    // Strategy 3: If still no client, check for client_name field directly on invoice
    if (!clientData) {
      const fallbackName = (rawData.client_name as string) || (rawData.recipient_name as string);
      if (fallbackName) {
        clientData = { name: fallbackName };
      }
    }

    // ── Fetch line items (multi-level fallback) ──
    let items: InvoicePDFData["items"] | undefined;

    // Strategy 0 (HIGHEST PRIORITY): Use items stored directly on the invoice
    // This handles manually created invoices with custom line items.
    const rawItems = rawData.items as
      | Array<{ description: string; quantity: number; unit_price: number }>
      | null;

    if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
      items = rawItems
        .filter((it) => it && it.description && Number(it.unit_price) > 0)
        .map((it) => {
          const qty = Number(it.quantity) || 1;
          const price = Number(it.unit_price) || 0;
          return {
            description: normalizeServiceName(it.description),
            qty,
            unit_price: price,
            amount: qty * price,
          };
        });
    }

    // Strategy 1: From contract_billings.services_snapshot (auto-billing only)
    // ONLY if Strategy 0 didn't find items (prevents overwrite of manual invoice items)
    if (!items && billingId) {
      const { data: billing } = await supabase
        .from("contract_billings")
        .select("services_snapshot, contract:client_contracts(is_prepaid, total_months_prepaid)")
        .eq("id", billingId)
        .single();

      const billingRow = billing as Record<string, unknown> | null;
      if (billingRow) {
        const snapshot = billingRow.services_snapshot as
          | { service: string; fee: number }[]
          | null;
        if (snapshot && Array.isArray(snapshot) && snapshot.length > 0) {
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
            description: normalizeServiceName(s.service),
            qty,
            unit_price: s.fee,
            amount: s.fee * qty,
          }));
        }
      }
    }

    // Strategy 2: If no items yet, fetch from contract_services via client_id
    if (!items && clientId) {
      const { data: services } = await supabase
        .from("contract_services")
        .select(
          `
          service_name, monthly_fee,
          contract:client_contracts!inner(
            is_prepaid, total_months_prepaid,
            client_id, status, end_date
          )
        `
        )
        .eq("contract.client_id", clientId)
        .eq("contract.status", "active")
        .eq("status", "active");

      const serviceRows = (services as Record<string, unknown>[] | null) || [];
      if (serviceRows.length > 0) {
        let isPrepaid = false;
        let prepaidMonths = 1;

        const firstContract = serviceRows[0]?.contract;
        let contractRow: Record<string, unknown> | null = null;
        if (Array.isArray(firstContract) && firstContract.length > 0) {
          contractRow = firstContract[0] as Record<string, unknown>;
        } else if (firstContract && typeof firstContract === "object") {
          contractRow = firstContract as Record<string, unknown>;
        }
        if (contractRow) {
          isPrepaid = (contractRow.is_prepaid as boolean) ?? false;
          prepaidMonths = (contractRow.total_months_prepaid as number) ?? 1;
        }

        const qty = isPrepaid ? prepaidMonths : 1;
        items = serviceRows
          .filter((r) => r.monthly_fee != null && Number(r.monthly_fee) > 0)
          .map((r) => {
            const fee = Number(r.monthly_fee) || 0;
            return {
              description: normalizeServiceName((r.service_name as string) || "Service"),
              qty,
              unit_price: fee,
              amount: fee * qty,
            };
          });
      }
    }

    // Strategy 3: If still no items, create single fallback item from invoice amount
    // (This ensures the table always shows meaningful data, not just a generic label)
    if (!items || items.length === 0) {
      const invoiceAmount = Number(rawData.amount) || 0;
      if (invoiceAmount > 0) {
        items = [
          {
            description: normalizeServiceName((rawData.description as string) || "Digital Advertising Management"),
            qty: 1,
            unit_price: invoiceAmount,
            amount: invoiceAmount,
          },
        ];
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