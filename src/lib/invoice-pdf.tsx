import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================
// Styles - match Invoice for Yourbestdeal format
// ============================================
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333333",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  logoSection: { flexDirection: "column" },
  logoText: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  logoSubtitle: {
    fontSize: 8,
    color: "#666666",
    letterSpacing: 1,
  },
  invoiceTitle: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    textAlign: "right",
  },
  invoiceMeta: {
    flexDirection: "column",
    alignItems: "flex-end",
    marginTop: 8,
  },
  metaText: { fontSize: 9, color: "#666666", marginBottom: 2 },
  metaBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#333333" },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: "#1a1a1a",
    marginBottom: 24,
  },
  billToSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  billTo: { flexDirection: "column" },
  billToLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#999999",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  billToName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
    marginBottom: 3,
  },
  billToDetail: { fontSize: 9, color: "#666666", marginBottom: 1 },
  infoSection: { flexDirection: "column", alignItems: "flex-end" },
  table: { marginTop: 20 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  colDesc: { flex: 2 },
  colQty: { flex: 1, textAlign: "center" as const },
  colPrice: { flex: 2, textAlign: "right" as const },
  colTotal: { flex: 2, textAlign: "right" as const },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    alignItems: "flex-start",
  },
  rowText: { fontSize: 10, color: "#333" },
  rowTextBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  rowSubText: { fontSize: 8, color: "#999", marginTop: 2 },
  summary: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
  summaryBox: { width: "50%" },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 10, color: "#666" },
  summaryValue: { fontSize: 10, color: "#333" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#1a1a1a",
    marginTop: 6,
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  totalValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a1a",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
  },
  footerDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    marginBottom: 10,
  },
  footerText: {
    fontSize: 8,
    color: "#999",
    textAlign: "center",
    lineHeight: 1.5,
  },
  paymentInfo: {
    marginTop: 24,
    padding: 12,
    backgroundColor: "#f9f9f9",
    borderRadius: 4,
  },
  paymentTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#333",
    marginBottom: 6,
  },
  paymentDetail: { fontSize: 9, color: "#666", marginBottom: 2 },
});

// ============================================
// Types
// ============================================
export interface InvoicePDFData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: number;
  tax: number;
  status: string;
  notes: string | null;
  billing_period: string | null;
  client?: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
}

// ============================================
// Helper
// ============================================
function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ============================================
// PDF Invoice Document Component
// ============================================
export function InvoicePDFDocument({ invoice }: { invoice: InvoicePDFData }) {
  const subtotal = invoice.amount;
  const tax = invoice.tax;
  const total = subtotal + tax;
  const clientName = invoice.client?.name || "Client";
  const period = invoice.billing_period || "Monthly Service Fee";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>hadona.</Text>
            <Text style={styles.logoSubtitle}>DIGITAL ADVERTISING AGENCY</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.invoiceMeta}>
              <Text style={styles.metaText}>
                No: <Text style={styles.metaBold}>{invoice.invoice_number}</Text>
              </Text>
              <Text style={styles.metaText}>
                Date:{" "}
                <Text style={styles.metaBold}>
                  {formatDate(invoice.issue_date)}
                </Text>
              </Text>
              <Text style={styles.metaText}>
                Due:{" "}
                <Text style={styles.metaBold}>
                  {formatDate(invoice.due_date)}
                </Text>
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ─── Bill To ─── */}
        <View style={styles.billToSection}>
          <View style={styles.billTo}>
            <Text style={styles.billToLabel}>BILLED TO</Text>
            <Text style={styles.billToName}>{clientName}</Text>
            {invoice.client?.email && (
              <Text style={styles.billToDetail}>{invoice.client.email}</Text>
            )}
            {invoice.client?.phone && (
              <Text style={styles.billToDetail}>{invoice.client.phone}</Text>
            )}
            {invoice.client?.address && (
              <Text style={styles.billToDetail}>{invoice.client.address}</Text>
            )}
          </View>
          <View style={styles.infoSection}>
            <Text style={styles.billToLabel}>FROM</Text>
            <Text style={styles.billToName}>hadona.</Text>
            <Text style={styles.billToDetail}>Digital Advertising Agency</Text>
            <Text style={styles.billToDetail}>info@hadona.id</Text>
            <Text style={styles.billToDetail}>hadona.id</Text>
          </View>
        </View>

        {/* ─── Table ─── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>
              DESCRIPTION
            </Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>QTY</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>
              UNIT PRICE
            </Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>
              AMOUNT
            </Text>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.colDesc}>
              <Text style={styles.rowTextBold}>
                Digital Advertising Management
              </Text>
              <Text style={styles.rowSubText}>{period}</Text>
            </View>
            <Text style={[styles.rowText, styles.colQty]}>1</Text>
            <Text style={[styles.rowText, styles.colPrice]}>
              {formatIDR(subtotal)}
            </Text>
            <Text style={[styles.rowTextBold, styles.colTotal]}>
              {formatIDR(subtotal)}
            </Text>
          </View>
        </View>

        {/* ─── Summary ─── */}
        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatIDR(subtotal)}</Text>
            </View>
            {tax > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>PPN (11%)</Text>
                <Text style={styles.summaryValue}>{formatIDR(tax)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL DUE</Text>
              <Text style={styles.totalValue}>{formatIDR(total)}</Text>
            </View>
          </View>
        </View>

        {/* ─── Payment Info ─── */}
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentTitle}>Payment Instructions:</Text>
          <Text style={styles.paymentDetail}>PT Hadona Digital Kreasi</Text>
          <Text style={styles.paymentDetail}>
            Bank Mandiri - 1234567890 (example)
          </Text>
          <Text style={styles.paymentDetail}>
            Please complete payment by {formatDate(invoice.due_date)}
          </Text>
          {invoice.notes && (
            <Text
              style={[
                styles.paymentDetail,
                { marginTop: 6, fontStyle: "italic" },
              ]}
            >
              {invoice.notes}
            </Text>
          )}
        </View>

        {/* ─── Footer ─── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            Terima kasih atas kepercayaan Anda kepada hadona.{"\n"}
            hadona.id — Digital Advertising Agency
          </Text>
        </View>
      </Page>
    </Document>
  );
}