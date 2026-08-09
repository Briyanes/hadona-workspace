import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

// ============================================
// Brand Palette — Hadona official colors
// Extracted from logo: #2B46BD (blue), #EDD947 (yellow)
// ============================================
const INK = "#0F172A";
const SLATE = "#334155";
const SLATE_LIGHT = "#64748B";
const SLATE_MUTED = "#94A3B8";
const HADONA_BLUE = "#2B46BD";
const HADONA_BLUE_DARK = "#1E3A8A";
const HADONA_BLUE_LIGHT = "#DDE3F8";
const HADONA_YELLOW = "#EDD947";
const BG_SOFT = "#F8FAFC";
const BG_TABLE_HEAD = "#2B46BD";
const BG_ROW_ALT = "#F1F5F9";
const BORDER = "#E2E8F0";
const WHITE = "#FFFFFF";

// ============================================
// Styles
// ============================================
const styles = StyleSheet.create({
  // ─── Page ───
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: SLATE,
    flexDirection: "column",
  },

  // ─── Hero Header ───
  hero: {
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 50,
    paddingVertical: 36,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  heroBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroLogo: {
    width: 48,
    height: 48,
    marginRight: 14,
  },
  heroBrandText: {
    flexDirection: "column",
  },
  brandName: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    lineHeight: 1,
  },
  brandSub: {
    fontSize: 8,
    color: HADONA_YELLOW,
    marginTop: 5,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  heroRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    lineHeight: 1,
  },
  invoiceBadge: {
    marginTop: 8,
    backgroundColor: HADONA_YELLOW,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 3,
  },
  invoiceBadgeText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: INK,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // Hero meta
  heroMetaRow: {
    flexDirection: "row",
  },
  heroMetaCol: {
    flexDirection: "column",
    marginRight: 50,
  },
  heroMetaLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  heroMetaValue: {
    fontSize: 11,
    color: WHITE,
    fontFamily: "Helvetica-Bold",
  },
  heroMetaValueSmall: {
    fontSize: 10,
    color: "#CBD5E1",
  },

  // ─── Body ───
  body: {
    paddingHorizontal: 50,
    paddingVertical: 32,
    flexGrow: 1,
  },

  // ─── Offering To ───
  offeringCard: {
    backgroundColor: BG_SOFT,
    borderLeftWidth: 4,
    borderLeftColor: HADONA_BLUE,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 2,
    marginBottom: 28,
  },
  offeringLabel: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: SLATE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  clientName: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 2,
  },
  clientLocality: {
    fontSize: 9,
    color: SLATE_LIGHT,
  },

  // ─── Table ───
  tableHead: {
    flexDirection: "row",
    backgroundColor: BG_TABLE_HEAD,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  colService: { flex: 3 },
  colQty: { flex: 1 },
  colFee: { flex: 2 },
  colTotal: { flex: 2 },
  th: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  thQty: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  thFee: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
  },
  thTotal: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
  },
  tableBody: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    alignItems: "center",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  rowAlt: {
    backgroundColor: BG_ROW_ALT,
  },
  serviceName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  servicePeriod: {
    fontSize: 8,
    color: SLATE_MUTED,
    marginTop: 3,
  },
  rowText: {
    fontSize: 10,
    color: SLATE,
    textAlign: "right",
  },
  rowTextBold: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textAlign: "right",
  },
  qtyBadgeWrapper: {
    flexDirection: "row",
    justifyContent: "center",
  },
  qtyBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: HADONA_BLUE_DARK,
    backgroundColor: HADONA_BLUE_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },

  // ─── Total Bar ───
  totalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 4,
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  totalValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },

  // ─── Note ───
  noteCard: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    borderRadius: 3,
    padding: 14,
    backgroundColor: "#FFFBEB",
  },
  noteTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  noteText: {
    fontSize: 8.5,
    color: "#78350F",
    lineHeight: 1.6,
  },

  // ─── Payment & Signature ───
  bottomRow: {
    flexDirection: "row",
    marginTop: 24,
  },
  paymentCard: {
    flex: 1.3,
    backgroundColor: BG_SOFT,
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 24,
  },
  paymentTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: HADONA_BLUE_DARK,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  paymentLabel: {
    fontSize: 8,
    color: SLATE_MUTED,
    width: 65,
  },
  paymentValue: {
    fontSize: 9,
    color: INK,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  paymentValueNormal: {
    fontSize: 9,
    color: SLATE,
    flex: 1,
  },
  signatureCard: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
  },
  signLine: {
    fontSize: 8,
    color: SLATE_MUTED,
    marginBottom: 4,
  },
  signName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 2,
  },
  signTitle: {
    fontSize: 9,
    color: SLATE_LIGHT,
    marginBottom: 4,
  },
  signWebsite: {
    fontSize: 9,
    color: HADONA_BLUE,
    fontFamily: "Helvetica-Bold",
  },

  // ─── Footer — pinned to bottom via flexGrow on body ───
  footer: {
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 50,
    paddingVertical: 18,
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 3,
  },
  footerAccent: {
    fontSize: 8,
    color: "#CBD5E1",
    textAlign: "center",
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
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

// ============================================
// Default NOTE
// ============================================
const DEFAULT_NOTE =
  "The quotation above does not include the ad budget and service fee. Additionally, the prices in this quotation are tentative and may change depending on the agreed campaign action plan with minimum contract for 3 months.";

// ============================================
// PDF Component
// ============================================
export function InvoicePDFDocument({ invoice }: { invoice: InvoicePDFData }) {
  const total = invoice.amount + (invoice.tax || 0);
  const clientName = invoice.client?.name || "Client";
  const period = invoice.billing_period || "Monthly Service";
  const statusLabel = invoice.is_prepaid
    ? `PREPAID ${invoice.prepaid_months || ""} MO`.trim()
    : "MONTHLY";

  const bankName = invoice.bank_name || "Bank Mandiri";
  const bankAccName = invoice.bank_account_name || "PT. Hadona Digital Media";
  const bankAccNum = invoice.bank_account_number || "1370023988708";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ═══ HERO HEADER ═══ */}
        <View style={styles.hero} fixed>
          <View style={styles.heroTop}>
            {/* Brand */}
            <View style={styles.heroBrand}>
              <Image
                style={styles.heroLogo}
                src="https://workspace.hadona.id/logo/logo-hadona.png"
              />
              <View style={styles.heroBrandText}>
                <Text style={styles.brandName}>Hadona</Text>
                <Text style={styles.brandSub}>Digital Agency</Text>
              </View>
            </View>

            {/* Invoice Title */}
            <View style={styles.heroRight}>
              <Text style={styles.invoiceLabel}>INVOICE</Text>
              <View style={styles.invoiceBadge}>
                <Text style={styles.invoiceBadgeText}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          {/* Meta Grid */}
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaCol}>
              <Text style={styles.heroMetaLabel}>Invoice Number</Text>
              <Text style={styles.heroMetaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.heroMetaCol}>
              <Text style={styles.heroMetaLabel}>Issue Date</Text>
              <Text style={styles.heroMetaValue}>{formatDateLong(invoice.issue_date)}</Text>
            </View>
            <View style={styles.heroMetaCol}>
              <Text style={styles.heroMetaLabel}>Due Date</Text>
              <Text style={styles.heroMetaValueSmall}>{formatDateLong(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        {/* ═══ BODY ═══ */}
        <View style={styles.body}>
          {/* Offering To */}
          <View style={styles.offeringCard}>
            <Text style={styles.offeringLabel}>Offering to</Text>
            <Text style={styles.clientName}>{clientName}</Text>
            <Text style={styles.clientLocality}>Di Tempat</Text>
          </View>

          {/* Table Header */}
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colService]}>Service</Text>
            <Text style={[styles.thQty, styles.colQty]}>Qty</Text>
            <Text style={[styles.thFee, styles.colFee]}>Service Fee</Text>
            <Text style={[styles.thTotal, styles.colTotal]}>Total</Text>
          </View>

          {/* Table Body */}
          <View style={styles.tableBody}>
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item, idx) => {
                const isLast = idx === invoice.items!.length - 1;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.tableRow,
                      idx % 2 === 1 ? styles.rowAlt : {},
                      isLast ? styles.tableRowLast : {},
                    ]}
                    wrap={false}
                  >
                    <View style={styles.colService}>
                      <Text style={styles.serviceName}>{item.description}</Text>
                      {idx === 0 && (
                        <Text style={styles.servicePeriod}>{period}</Text>
                      )}
                    </View>
                    <View style={styles.colQty}>
                      <View style={styles.qtyBadgeWrapper}>
                        <Text style={styles.qtyBadge}>{item.qty}mo</Text>
                      </View>
                    </View>
                    <Text style={[styles.rowText, styles.colFee]}>
                      {formatIDR(item.unit_price)}
                    </Text>
                    <Text style={[styles.rowTextBold, styles.colTotal]}>
                      {formatIDR(item.amount)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <View style={styles.tableRow} wrap={false}>
                <View style={styles.colService}>
                  <Text style={styles.serviceName}>Digital Advertising Management</Text>
                  <Text style={styles.servicePeriod}>{period}</Text>
                </View>
                <View style={styles.colQty}>
                  <View style={styles.qtyBadgeWrapper}>
                    <Text style={styles.qtyBadge}>1mo</Text>
                  </View>
                </View>
                <Text style={[styles.rowText, styles.colFee]}>
                  {formatIDR(invoice.amount)}
                </Text>
                <Text style={[styles.rowTextBold, styles.colTotal]}>
                  {formatIDR(invoice.amount)}
                </Text>
              </View>
            )}
          </View>

          {/* Total Bar */}
          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Total Due</Text>
            <Text style={styles.totalValue}>{formatIDR(total)}</Text>
          </View>

          {/* Note */}
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Important Note</Text>
            <Text style={styles.noteText}>
              {invoice.notes || DEFAULT_NOTE}
            </Text>
          </View>

          {/* Payment + Signature */}
          <View style={styles.bottomRow}>
            {/* Payment */}
            <View style={styles.paymentCard}>
              <Text style={styles.paymentTitle}>Payment Method</Text>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Bank</Text>
                <Text style={styles.paymentValue}>{bankName}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Account</Text>
                <Text style={styles.paymentValueNormal}>{bankAccName}</Text>
              </View>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Number</Text>
                <Text style={styles.paymentValue}>{bankAccNum}</Text>
              </View>
            </View>

            {/* Signature */}
            <View style={styles.signatureCard}>
              <Text style={styles.signLine}>Hormat kami,</Text>
              <Text style={styles.signName}>Nur Hadi Pranowo</Text>
              <Text style={styles.signTitle}>CMO</Text>
              <Text style={styles.signWebsite}>www.hadona.id</Text>
            </View>
          </View>
        </View>

        {/* ═══ FOOTER ═══ */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            PT. Hadona Digital Media · Digital Advertising Agency
          </Text>
          <Text style={styles.footerAccent}>
            info@hadona.id · www.hadona.id · +62 21 1234 5678
          </Text>
        </View>
      </Page>
    </Document>
  );
}