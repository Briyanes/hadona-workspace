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
// Styles — Optimized for space efficiency
// Multi-page safe with compact layout
// ============================================
const styles = StyleSheet.create({
  // ─── Page ───
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: SLATE,
    flexDirection: "column",
  },

  // ─── Hero Header ───
  hero: {
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 40,
    paddingVertical: 20,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  heroBrand: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroLogo: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  heroBrandText: {
    flexDirection: "column",
  },
  brandName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    lineHeight: 1,
  },
  brandSub: {
    fontSize: 7,
    color: HADONA_YELLOW,
    marginTop: 3,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  heroRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    lineHeight: 1,
  },
  invoiceBadge: {
    marginTop: 5,
    backgroundColor: HADONA_YELLOW,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 3,
  },
  invoiceBadgeText: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  // Hero meta
  heroMetaRow: {
    flexDirection: "row",
  },
  heroMetaCol: {
    flexDirection: "column",
    marginRight: 36,
  },
  heroMetaLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: SLATE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  heroMetaValue: {
    fontSize: 10,
    color: WHITE,
    fontFamily: "Helvetica-Bold",
  },
  heroMetaValueSmall: {
    fontSize: 9,
    color: "#CBD5E1",
  },

  // ─── Body ───
  body: {
    paddingHorizontal: 40,
    paddingVertical: 18,
    flexGrow: 1,
  },

  // ─── Offering To ───
  offeringWrapper: {
    flexDirection: "row",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 18,
  },
  offeringAccent: {
    width: 4,
    backgroundColor: HADONA_BLUE,
  },
  offeringCard: {
    flex: 1,
    backgroundColor: BG_SOFT,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offeringLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: SLATE_MUTED,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 1,
  },
  clientLocality: {
    fontSize: 8,
    color: SLATE_LIGHT,
  },

  // ─── Table ───
  tableHead: {
    flexDirection: "row",
    backgroundColor: BG_TABLE_HEAD,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  colService: { flex: 3 },
  colQty: { flex: 1 },
  colFee: { flex: 2 },
  colTotal: { flex: 2 },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  thQty: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  thFee: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "right",
  },
  thTotal: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "right",
  },
  tableBody: {
    borderWidth: 1,
    borderColor: BORDER,
    borderTopWidth: 0,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
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
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  servicePeriod: {
    fontSize: 7,
    color: SLATE_MUTED,
    marginTop: 2,
  },
  rowText: {
    fontSize: 9,
    color: SLATE,
    textAlign: "right",
  },
  rowTextBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textAlign: "right",
  },
  qtyBadgeWrapper: {
    flexDirection: "row",
    justifyContent: "center",
  },
  qtyBadge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: HADONA_BLUE_DARK,
    backgroundColor: HADONA_BLUE_LIGHT,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 3,
  },

  // ─── Total Bar ───
  totalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 4,
    marginTop: 12,
  },
  totalLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  totalValue: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },

  // ─── Note ───
  noteCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
    borderRadius: 3,
    padding: 10,
    backgroundColor: "#FFFBEB",
  },
  noteTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#92400E",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 8,
    color: "#78350F",
    lineHeight: 1.5,
  },

  // ─── Payment & Signature ───
  bottomRow: {
    flexDirection: "row",
    marginTop: 16,
  },
  paymentCard: {
    flex: 1.3,
    backgroundColor: BG_SOFT,
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 18,
  },
  paymentTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: HADONA_BLUE_DARK,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  paymentRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  paymentLabel: {
    fontSize: 7.5,
    color: SLATE_MUTED,
    width: 55,
  },
  paymentValue: {
    fontSize: 8.5,
    color: INK,
    fontFamily: "Helvetica-Bold",
    flex: 1,
  },
  paymentValueNormal: {
    fontSize: 8.5,
    color: SLATE,
    flex: 1,
  },
  signatureCard: {
    flex: 1,
    alignItems: "center",
    paddingTop: 4,
  },
  signLine: {
    fontSize: 7.5,
    color: SLATE_MUTED,
    marginBottom: 2,
  },
  signatureImage: {
    width: 130,
    height: 65,
    marginBottom: 2,
  },
  signName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 1,
  },
  signTitle: {
    fontSize: 8,
    color: SLATE_LIGHT,
    marginBottom: 3,
  },
  signWebsite: {
    fontSize: 8,
    color: HADONA_BLUE,
    fontFamily: "Helvetica-Bold",
  },

  // ─── Footer ───
  footer: {
    backgroundColor: HADONA_BLUE,
    paddingHorizontal: 40,
    paddingVertical: 12,
    alignItems: "center",
  },
  footerText: {
    fontSize: 7.5,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 2,
  },
  footerAccent: {
    fontSize: 7.5,
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
  "The quotation above does not include the ad budget. Additionally, the prices in this quotation are tentative and may change depending on the agreed campaign action plan with minimum contract for 3 months.";

// ============================================
// Subtotal Bar (for multi-item invoices)
// ============================================
function SubtotalBar({ items, tax, total }: { items: InvoiceLineItem[]; tax: number; total: number }) {
  const subtotal = items.reduce((s, it) => s + it.amount, 0);
  const hasTax = tax > 0;
  return (
    <View style={{ marginTop: 10, paddingHorizontal: 4 }}>
      {/* Subtotal row */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
        <Text style={{ fontSize: 8, color: SLATE_MUTED, width: 100, textAlign: "right" }}>Subtotal</Text>
        <Text style={{ fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold", width: 100, textAlign: "right" }}>
          {formatIDR(subtotal)}
        </Text>
      </View>
      {/* Tax row (only if tax > 0) */}
      {hasTax && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
          <Text style={{ fontSize: 8, color: SLATE_MUTED, width: 100, textAlign: "right" }}>Pajak/PPh</Text>
          <Text style={{ fontSize: 8.5, color: INK, fontFamily: "Helvetica-Bold", width: 100, textAlign: "right" }}>
            {formatIDR(tax)}
          </Text>
        </View>
      )}
      {/* Divider */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <View style={{ width: 210, height: 1, backgroundColor: BORDER, marginBottom: 6 }} />
      </View>
      {/* Total */}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: HADONA_BLUE_DARK, width: 100, textAlign: "right" }}>
          Total Due
        </Text>
        <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: HADONA_BLUE, width: 100, textAlign: "right" }}>
          {formatIDR(total)}
        </Text>
      </View>
    </View>
  );
}

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

  // Use items from invoice or fallback
  const items: InvoiceLineItem[] =
    invoice.items && invoice.items.length > 0
      ? invoice.items
      : [
          {
            description: "Digital Advertising Management",
            qty: 1,
            unit_price: invoice.amount,
            amount: invoice.amount,
          },
        ];

  const hasMultipleItems = items.length > 1;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ═══ HERO HEADER (fixed — repeats on every page) ═══ */}
        <View style={styles.hero} fixed>
          <View style={styles.heroTop}>
            {/* Brand */}
            <View style={styles.heroBrand}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
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
          <View style={styles.offeringWrapper}>
            <View style={styles.offeringAccent} />
            <View style={styles.offeringCard}>
              <Text style={styles.offeringLabel}>Offering to</Text>
              <Text style={styles.clientName}>{clientName}</Text>
              <Text style={styles.clientLocality}>Di Tempat</Text>
            </View>
          </View>

          {/* Table Header (fixed — repeats on page 2 if items overflow) */}
          <View style={styles.tableHead} fixed>
            <Text style={[styles.th, styles.colService]}>Service</Text>
            <Text style={[styles.thQty, styles.colQty]}>Qty</Text>
            <Text style={[styles.thFee, styles.colFee]}>Fee</Text>
            <Text style={[styles.thTotal, styles.colTotal]}>Total</Text>
          </View>

          {/* Table Body */}
          <View style={styles.tableBody}>
            {items.map((item, idx) => {
              const isLast = idx === items.length - 1;
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
            })}
          </View>

          {/* ═══ BOTTOM SECTION (keep together — never split across pages) ═══ */}
          <View wrap={false}>
            {/* Subtotal breakdown (only for multi-item) or Total Bar */}
            {hasMultipleItems ? (
              <>
                <SubtotalBar items={items} tax={invoice.tax} total={total} />
                {/* Compact total confirmation bar */}
                <View style={[styles.totalBar, { marginTop: 8, paddingVertical: 10 }]}>
                  <Text style={[styles.totalLabel, { fontSize: 9 }]}>Grand Total</Text>
                  <Text style={[styles.totalValue, { fontSize: 15 }]}>{formatIDR(total)}</Text>
                </View>
              </>
            ) : (
              /* Single item: use the blue total bar */
              <View style={styles.totalBar}>
                <Text style={styles.totalLabel}>Total Due</Text>
                <Text style={styles.totalValue}>{formatIDR(total)}</Text>
              </View>
            )}

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
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image
                  style={styles.signatureImage}
                  src="https://workspace.hadona.id/ttd-hadi.png"
                />
                <Text style={styles.signName}>Nur Hadi Pranowo</Text>
                <Text style={styles.signTitle}>CMO</Text>
                <Text style={styles.signWebsite}>www.hadona.id</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ═══ FOOTER (fixed — repeats on every page) ═══ */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            PT. Hadona Digital Media · Digital Advertising Agency
          </Text>
          <Text style={styles.footerAccent}>
            info@hadona.id · www.hadona.id · +62 851-5800-0123
          </Text>
        </View>
      </Page>
    </Document>
  );
}