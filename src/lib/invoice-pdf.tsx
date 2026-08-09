import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================
// Brand Colors — Hadona Digital Agency
// ============================================
const BRAND_BLUE = "#1B3A5C";
const TEXT_DARK = "#1a1a1a";
const TEXT_MEDIUM = "#555555";
const TEXT_LIGHT = "#999999";
const BORDER_GRAY = "#D0D5DD";

// ============================================
// Styles — Exact match to Canva template
// ============================================
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    paddingTop: 50,
    paddingBottom: 50,
    paddingLeft: 50,
    paddingRight: 50,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: TEXT_DARK,
  },

  // ─── Header ───
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  brandSection: { flexDirection: "column" },
  brandName: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
  },
  brandSub: {
    fontSize: 9,
    color: TEXT_MEDIUM,
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },

  // ─── Offering To ───
  offeringSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 25,
  },
  offeringTo: { flexDirection: "column", flex: 1 },
  offeringLabel: {
    fontSize: 8,
    color: TEXT_LIGHT,
    marginBottom: 6,
  },
  clientName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 4,
  },
  clientLocality: {
    fontSize: 10,
    color: TEXT_MEDIUM,
  },

  // ─── Number/Date Row ───
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 8,
    color: TEXT_LIGHT,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 10,
    color: TEXT_DARK,
    fontFamily: "Helvetica-Bold",
  },
  metaLeft: { flexDirection: "column", flex: 1 },
  metaRight: { flexDirection: "column", alignItems: "flex-end", flex: 1 },
  metaDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
    marginBottom: 20,
  },

  // ─── Table ───
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: BRAND_BLUE,
    paddingVertical: 8,
  },
  colService: { flex: 3 },
  colQty: { flex: 1, textAlign: "center" as const },
  colFee: { flex: 2, textAlign: "right" as const },
  colTotal: { flex: 2, textAlign: "right" as const },
  thText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 14,
    alignItems: "center",
  },
  rowText: { fontSize: 10, color: TEXT_DARK },
  rowTextBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },
  totalSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
  },

  // ─── Grand Total ───
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    alignItems: "center",
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
  },
  grandTotalValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
  },

  // ─── Note ───
  noteBlock: {
    marginTop: 20,
    marginBottom: 16,
  },
  noteTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 8.5,
    color: TEXT_MEDIUM,
    lineHeight: 1.5,
  },

  // ─── Payment Method ───
  paymentBlock: {
    marginTop: 10,
  },
  paymentTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: BRAND_BLUE,
    marginBottom: 6,
  },
  paymentText: {
    fontSize: 9.5,
    color: TEXT_DARK,
    marginBottom: 2,
  },
  paymentTextBold: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 2,
  },

  // ─── Signature ───
  signatureBlock: {
    marginTop: 30,
    alignItems: "flex-start",
  },
  signName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 2,
  },
  signTitle: {
    fontSize: 9,
    color: TEXT_MEDIUM,
    marginBottom: 2,
  },
  signWebsite: {
    fontSize: 9,
    color: BRAND_BLUE,
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
  tax_rate?: number;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  is_prepaid?: boolean;
  prepaid_months?: number;
}

// ============================================
// Helpers
// ============================================
function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function formatDateLong(d: string) {
  if (!d) return "-";
  const date = new Date(d);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2,"0")} /${date.getFullYear()}`;
}

// ============================================
// Default NOTE text (from template)
// ============================================
const DEFAULT_NOTE =
  "The quotation above does not include the ad budget and service fee. Additionally, the prices in this quotation are tentative and may change depending on the agreed campaign action plan with minimum contract for 3 month";

// ============================================
// PDF Component
// ============================================
export function InvoicePDFDocument({ invoice }: { invoice: InvoicePDFData }) {
  const total = invoice.amount + (invoice.tax || 0);
  const clientName = invoice.client?.name || "Client";
  const period = invoice.billing_period || "Monthly";

  // Bank details — default to Hadona's Mandiri
  const bankName = invoice.bank_name || "Bank Mandiri";
  const bankAccName = invoice.bank_account_name || "PT. Hadona Digital Media";
  const bankAccNum = invoice.bank_account_number || "1370023988708";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ─── Header ─── */}
        <View style={styles.header}>
          <View style={styles.brandSection}>
            <Text style={styles.brandName}>Hadona</Text>
            <Text style={styles.brandSub}>Digital Agency</Text>
          </View>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
        </View>

        {/* ─── Offering To ─── */}
        <View style={styles.offeringSection}>
          <View style={styles.offeringTo}>
            <Text style={styles.offeringLabel}>Offering to:</Text>
            <Text style={styles.clientName}>{clientName}</Text>
            <Text style={styles.clientLocality}>Di Tempat</Text>
          </View>
        </View>

        {/* ─── Number & Date ─── */}
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={styles.metaLabel}>Number</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDateLong(invoice.issue_date)}</Text>
          </View>
        </View>
        <View style={styles.metaDivider} />

        {/* ─── Table ─── */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.colService]}>Service</Text>
            <Text style={[styles.thText, styles.colQty]}>Qty</Text>
            <Text style={[styles.thText, styles.colFee]}>Service Fee</Text>
            <Text style={[styles.thText, styles.colTotal]}>Total</Text>
          </View>

          {/* Rows */}
          {invoice.items && invoice.items.length > 0 ? (
            invoice.items.map((item, idx) => (
              <View key={idx} style={styles.tableRow} wrap={false}>
                <View style={styles.colService}>
                  <Text style={styles.rowTextBold}>{item.description}</Text>
                  {idx === 0 && (
                    <Text style={{ fontSize: 8, color: TEXT_LIGHT, marginTop: 2 }}>
                      {period}
                    </Text>
                  )}
                </View>
                <Text style={[styles.rowText, styles.colQty]}>{item.qty}mo</Text>
                <Text style={[styles.rowText, styles.colFee]}>
                  {formatIDR(item.unit_price)}
                </Text>
                <Text style={[styles.rowTextBold, styles.colTotal]}>
                  {formatIDR(item.amount)}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <View style={styles.colService}>
                <Text style={styles.rowTextBold}>Digital Advertising Management</Text>
                <Text style={{ fontSize: 8, color: TEXT_LIGHT, marginTop: 2 }}>
                  {period}
                </Text>
              </View>
              <Text style={[styles.rowText, styles.colQty]}>1mo</Text>
              <Text style={[styles.rowText, styles.colFee]}>
                {formatIDR(invoice.amount)}
              </Text>
              <Text style={[styles.rowTextBold, styles.colTotal]}>
                {formatIDR(invoice.amount)}
              </Text>
            </View>
          )}

          {/* Total Separator */}
          <View style={styles.totalSeparator} />

          {/* Grand Total */}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatIDR(total)}</Text>
          </View>
        </View>

        {/* ─── NOTE ─── */}
        <View style={styles.noteBlock}>
          <Text style={styles.noteTitle}>NOTE</Text>
          <Text style={styles.noteText}>
            {invoice.notes || DEFAULT_NOTE}
          </Text>
        </View>

        {/* ─── Payment Method ─── */}
        <View style={styles.paymentBlock}>
          <Text style={styles.paymentTitle}>PAYMENT METHOD</Text>
          <Text style={styles.paymentText}>{bankName}</Text>
          <Text style={styles.paymentTextBold}>{bankAccName}</Text>
          <Text style={styles.paymentText}>{bankAccNum}</Text>
        </View>

        {/* ─── Signature ─── */}
        <View style={styles.signatureBlock}>
          <Text style={styles.signName}>Nur Hadi Pranowo</Text>
          <Text style={styles.signTitle}>CMO</Text>
          <Text style={styles.signWebsite}>www.hadona.id</Text>
        </View>
      </Page>
    </Document>
  );
}