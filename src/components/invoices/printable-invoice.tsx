"use client";

import type { Invoice } from "./types";
import { formatIDR, formatDate } from "@/lib/utils";

/**
 * PrintableInvoice — renders a professional invoice layout optimized for
 * `window.print()` / "Save as PDF". The component is hidden on screen
 * (`.print-area`) and only becomes visible during print (see globals.css).
 */
export function PrintableInvoice({
  invoice,
  companyName = "Hadona Digital Media",
}: {
  invoice: Invoice | null;
  companyName?: string;
}) {
  if (!invoice) return null;

  const subtotal = invoice.amount;
  const tax = invoice.tax || 0;
  const total = subtotal + tax;
  const items = invoice.items ?? [];

  return (
    <div className="print-area hidden">
      {/* Print-only header */}
      <div className="print-header">
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{companyName}</h1>
        <p style={{ fontSize: 12, color: "#6b7280" }}>Digital Creative Agency</p>
      </div>

      <div style={{ padding: "20px 0" }}>
        {/* Top: Company info + Invoice meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              {companyName}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
              Jl. Sudirman No. 123, Jakarta
              <br />
              admin@hadona.id · +62 851-5800-0123
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#2b46bb",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              INVOICE
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                marginTop: 4,
                color: "#374151",
              }}
            >
              {invoice.invoice_number}
            </div>
          </div>
        </div>

        {/* Bill To + Dates */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 32,
            borderTop: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
            padding: "16px 0",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                color: "#9ca3af",
                marginBottom: 4,
              }}
            >
              Bill To
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {invoice.client?.name || "—"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12 }}>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "#9ca3af" }}>Issue Date: </span>
              <span style={{ fontWeight: 500 }}>
                {formatDate(invoice.issue_date)}
              </span>
            </div>
            <div>
              <span style={{ color: "#9ca3af" }}>Due Date: </span>
              <span style={{ fontWeight: 500 }}>
                {formatDate(invoice.due_date)}
              </span>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        {items.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginBottom: 24,
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, textTransform: "uppercase", color: "#6b7280" }}>
                  Description
                </th>
                <th style={{ textAlign: "center", padding: "8px 12px", fontSize: 10, textTransform: "uppercase", color: "#6b7280" }}>
                  Qty
                </th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, textTransform: "uppercase", color: "#6b7280" }}>
                  Unit Price
                </th>
                <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 10, textTransform: "uppercase", color: "#6b7280" }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={idx}
                  style={{ borderBottom: "1px solid #f3f4f6" }}
                >
                  <td style={{ padding: "10px 12px" }}>{item.description}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    {formatIDR(item.unit_price)}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 500 }}>
                    {formatIDR(item.quantity * item.unit_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 32,
          }}
        >
          <div style={{ minWidth: 250, fontSize: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
              }}
            >
              <span style={{ color: "#6b7280" }}>Subtotal</span>
              <span style={{ fontWeight: 500 }}>{formatIDR(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                }}
              >
                <span style={{ color: "#6b7280" }}>Tax / PPh</span>
                <span style={{ fontWeight: 500 }}>{formatIDR(tax)}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                borderTop: "2px solid #e5e7eb",
                marginTop: 8,
                paddingTop: 12,
                fontSize: 16,
                fontWeight: 700,
                color: "#2b46bb",
              }}
            >
              <span>TOTAL</span>
              <span>{formatIDR(total)}</span>
            </div>
          </div>
        </div>

        {/* Status + Notes */}
        <div style={{ marginBottom: 32, fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: "#9ca3af", textTransform: "uppercase", fontSize: 10, marginRight: 8 }}>
              Status:
            </span>
            <span
              style={{
                fontWeight: 600,
                textTransform: "capitalize",
                padding: "2px 10px",
                borderRadius: 4,
                backgroundColor:
                  invoice.status === "paid"
                    ? "#dcfce7"
                    : invoice.status === "overdue"
                    ? "#fee2e2"
                    : invoice.status === "sent"
                    ? "#dbeafe"
                    : "#f3f4f6",
                color:
                  invoice.status === "paid"
                    ? "#16a34a"
                    : invoice.status === "overdue"
                    ? "#dc2626"
                    : "#374151",
              }}
            >
              {invoice.status}
            </span>
          </div>
          {invoice.notes && (
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  color: "#9ca3af",
                  marginBottom: 4,
                }}
              >
                Notes
              </div>
              <div style={{ color: "#4b5563", lineHeight: 1.5 }}>
                {invoice.notes}
              </div>
            </div>
          )}
        </div>

        {/* Signature */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 24,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>
              Hormat kami,
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ttd-hadi.png"
              alt="Tanda Tangan"
              style={{ width: 220, height: "auto", marginBottom: 4 }}
            />
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1f2937" }}>
              Nur Hadi Pranowo
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>CMO</div>
            <div style={{ fontSize: 11, color: "#2b46bb", fontWeight: 600 }}>
              www.hadona.id
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: 16,
            textAlign: "center",
            fontSize: 10,
            color: "#9ca3af",
          }}
        >
          <p>Terima kasih atas kepercayaan Anda kepada {companyName}.</p>
          <p>
            Pembayaran via transfer bank — Bank BCA 1234567890 a.n. Hadona
            Digital Media
          </p>
        </div>
      </div>
    </div>
  );
}