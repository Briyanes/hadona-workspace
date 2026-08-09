import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================
// Brand Colors
// ============================================
const BRAND_BLUE = "#1B3A5C";      // Deep navy blue — header accent
const BRAND_BLUE_LIGHT = "#2E5A87"; // Lighter blue — subtle accents
const BRAND_GRAY = "#F4F6F8";       // Very light gray — table header bg
const BRAND_GRAY_BORDER = "#E0E4E8"; // Border gray
const TEXT_DARK = "#1a1a1a";
const TEXT_MEDIUM = "#555555";
const TEXT_LIGHT = "#999999";

// ============================================
// Styles — match "Invoice for Yourbestdeal" Canva format
// ============================================
const styles = StyleSheet.create({
  // ─── Page ───
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingTop: 0,
    paddingBottom: 40,
    paddingLeft: 48,
    paddingRight: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TEXT_DARK,
  },

  // ─── Top Blue Accent Bar ───
  topAccentBar: {
    width: "100%",
    height: 6,
    backgroundColor: BRAND_BLUE,
    marginBottom: 36,
  },

  // ─── Header ───
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  logoSection: {
    flexDirection: "column",
  },
  logoText: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    marginBottom: 2,
  },
  logoSubtitle: {
    fontSize: 7,
    color: TEXT_LIGHT,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // ─── Invoice Title & Meta ───
  invoiceTitleBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    lineHeight: 1,
    marginBottom: 8,
  },
  invoiceMeta: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 8,
    color: TEXT_LIGHT,
    marginRight: 4,
  },
  metaValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },

  // ─── Divider ───
  divider: {
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND_BLUE,
    marginBottom: 20,
  },

  // ─── Bill To Section ───
  billToSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  billTo: {
    flexDirection: "column",
    flex: 1,
  },
  billToLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: TEXT_LIGHT,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  billToName: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 4,
  },
  billToDetail: {
    fontSize: 9,
    color: TEXT_MEDIUM,
    marginBottom: 2,
  },
  infoSection: {
    flexDirection: "column",
    alignItems: "flex-end",
  },

  // ─── Table ───
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND_BLUE,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "center" as const },
  colPrice: { flex: 2, textAlign: "right" as const },
  colTotal: { flex: 2, textAlign: "right" as const },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_GRAY_BORDER,
    alignItems: "flex-start",
  },
  tableRowAlt: {
    backgroundColor: "#FAFBFC",
  },
  rowText: {
    fontSize: 10,
    color: TEXT_DARK,
  },
  rowTextBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },
  rowSubText: {
    fontSize: 8,
    color: TEXT_LIGHT,
    marginTop: 3,
  },

  // ─── Summary ───
  summary: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    marginBottom: 20,
  },
  summaryBox: {
    width: "45%",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 10,
    color: TEXT_MEDIUM,
  },
  summaryValue: {
    fontSize: 10,
    color: TEXT_DARK,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: BRAND_BLUE,
    marginTop: 8,
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
  },

  // ─── Payment Info Box ───
  paymentInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#F0F4F8",
    borderLeftWidth: 4,
    borderLeftColor: BRAND_BLUE,
    borderRadius: 2,
  },
  paymentTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  paymentDetail: {
    fontSize: 9,
    color: TEXT_MEDIUM,
    marginBottom: 3,
  },
  paymentDetailBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 3,
  },

  // ─── Footer ───
  footer: {
    position: "absolute",
    bottom: 30,
    left: 48,
    right: 48,
    flexDirection: "column",
  },
  footerDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND_GRAY_BORDER,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 8,
    color: TEXT_LIGHT,
    textAlign: "center",
    lineHeight: 1.6,
  },
  footerBrand: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    textAlign: "center",
    marginTop: 2,
  },
});

// ============================================
// Types
// ============================================
export interface InvoiceLineItem {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface InvoicePDFData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: number;
  tax: number;
  status: string;
  notes: string | null;
  billing_period: string | null;
  items?: InvoiceLineItem[];
  client?: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  // Dynamic tax rate from contract (Bug #1 fix)
  tax_rate?: number;
  // Bank details from contract/workspace (Bug #2 fix)
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  // Prepaid info (Bug #6 fix)
  is_prepaid?: boolean;
  prepaid_months?: number;
}

// ============================================
// Helper Functions
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

  // Dynamic tax rate display (Bug #1 fix)
  const taxRateDisplay = invoice.tax_rate != null ? invoice.tax_rate : 11;

  // Bank details (Bug #2 fix)
  const bankName = invoice.bank_name || "BCA";
  const bankAccName = invoice.bank_account_name || "PT Hadona Digital Kreasi";
  const bankAccNum = invoice.bank_account_number || "1234567890";

  // Prepaid label (Bug #6 fix)
  const prepaidLabel =
    invoice.is_prepaid && invoice.prepaid_months
      ? ` (Prepaid ${invoice.prepaid_months} bulan)`
      : "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── Top Accent Bar ─── */}
        <View style={styles.topAccentBar} />

        {/* ─── Header ─── */}
        <View style={styles.header}>
          {/* Logo / Brand */}
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>hadona.</Text>
            <Text style={styles.logoSubtitle}>DIGITAL ADVERTISING AGENCY</Text>
          </View>

          {/* Invoice Title & Meta */}
          <View style={styles.invoiceTitleBlock}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.invoiceMeta}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>No.</Text>
                <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Date</Text>
                <Text style={styles.metaValue}>
                  {formatDate(invoice.issue_date)}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due</Text>
                <Text style={styles.metaValue}>
                  {formatDate(invoice.due_date)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ─── Bill To Section ─── */}
        <View style={styles.billToSection}>
          {/* Offering To */}
          <View style={styles.billTo}>
            <Text style={styles.billToLabel}>OFFERING TO</Text>
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

          {/* From */}
          <View style={styles.infoSection}>
            <Text style={styles.billToLabel}>FROM</Text>
            <Text style={styles.billToName}>hadona.</Text>
            <Text style={styles.billToDetail}>Digital Advertising Agency</Text>
            <Text style={styles.billToDetail}>info@hadona.id</Text>
            <Text style={styles.billToDetail}>hadona.id</Text>
          </View>
        </View>

        {/* ─── Items Table ─── */}
        <View style={styles.table}>
          {/* Table Header */}
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

          {/* Table Rows */}
          {invoice.items && invoice.items.length > 0 ? (
            invoice.items.map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 ? styles.tableRowAlt : {},
                ]}
                wrap={false}
              >
                <View style={styles.colDesc}>
                  <Text style={styles.rowTextBold}>{item.description}</Text>
                  {idx === 0 && <Text style={styles.rowSubText}>{period}</Text>}
                </View>
                <Text style={[styles.rowText, styles.colQty]}>{item.qty}</Text>
                <Text style={[styles.rowText, styles.colPrice]}>
                  {formatIDR(item.unit_price)}
                </Text>
                <Text style={[styles.rowTextBold, styles.colTotal]}>
                  {formatIDR(item.amount)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <View style={styles.colDesc}>
                <Text style={styles.rowTextBold}>
                  Digital Advertising Management{prepaidLabel}
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
          )}
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
                <Text style={styles.summaryLabel}>
                  PPN ({taxRateDisplay}%)
                </Text>
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
          <Text style={styles.paymentTitle}>Payment Instructions</Text>
          <Text style={styles.paymentDetailBold}>{bankAccName}</Text>
          <Text style={styles.paymentDetail}>
            Bank {bankName} — {bankAccNum}
          </Text>
          <Text style={[styles.paymentDetail, { marginTop: 6 }]}>
            Please complete payment by {formatDate(invoice.due_date)}.
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
            Terima kasih atas kepercayaan Anda kepada hadona.
          </Text>
          <Text style={styles.footerBrand}>
            hadona.id — Digital Advertising Agency
          </Text>
        </View>
      </Page>
    </Document>
  );
}