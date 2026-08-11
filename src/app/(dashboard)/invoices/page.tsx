"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  X,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Clock,
  CheckCircle,
  AlertCircle,
  Printer,
  Download,
  UserPlus,
  FileSignature,
  Sparkles,
} from "lucide-react";
import { cn, formatDate, formatIDR, extractError } from "@/lib/utils";
import { PrintableInvoice } from "@/components/invoices/printable-invoice";

interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: number;
  tax: number;
  status: string;
  items: InvoiceItem[];
  notes: string | null;
  paid_date: string | null;
  created_at: string;
  client?: { name: string };
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface Client {
  id: string;
  name: string;
}

interface ContractInfo {
  id: string;
  contract_number: string | null;
  is_prepaid: boolean;
  total_months_prepaid: number;
  prepaid_amount: number;
  tax_rate: number;
  bank_account: string | null;
  payment_schedule: string;
}

interface ContractServiceInfo {
  service_name: string;
  monthly_fee: number;
}

// Daftar layanan Hadona (sinkron dengan contract-manager)
const SERVICE_OPTIONS = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "SEO",
  "Content Production",
  "Social Media Management",
  "Web Development",
  "Branding",
  "Photography",
  "Video Production",
  "Influencer Marketing",
  "Copywriting",
  "KOL Management",
];

const statusColors: Record<string, string> = {
  draft: "bg-surface text-muted",
  sent: "bg-primary/20 text-primary",
  paid: "bg-success/20 text-success",
  overdue: "bg-danger/20 text-danger",
  cancelled: "bg-surface text-muted",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const emptyForm = {
  client_id: "",
  is_new_client: false,
  new_client_name: "",
  new_client_email: "",
  new_client_phone: "",
  invoice_number: "",
  issue_date: new Date().toISOString().split("T")[0],
  due_date: "",
  tax: "",
  status: "draft",
  notes: "",
  items: [{ description: "", quantity: 1, unit_price: 0 }] as InvoiceItem[],
};

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Contract auto-fill
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [contractServices, setContractServices] = useState<ContractServiceInfo[]>([]);

  // Print
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // ── Derived: subtotal from items ──
  const itemsSubtotal = form.items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0),
    0
  );
  const taxAmount = parseFloat(form.tax) || 0;
  const grandTotal = itemsSubtotal + taxAmount;

  function handlePrint(inv: Invoice) {
    setPrintInvoice(inv);
    setTimeout(() => {
      window.print();
      setTimeout(() => setPrintInvoice(null), 500);
    }, 200);
  }

  function handleDownloadPDF(inv: Invoice) {
    window.open(`/api/invoices/${inv.id}/pdf`, "_blank");
  }

  useEffect(() => {
    loadInvoices();
    loadClients();
  }, []);

  async function loadInvoices() {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setInvoices((data as unknown as Invoice[]) || []);
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal memuat invoices: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    setClients((data as unknown as Client[]) || []);
  }

  // ── Fetch active contract for selected client ──
  async function fetchContractForClient(clientId: string) {
    setContractInfo(null);
    setContractServices([]);
    if (!clientId) return;

    try {
      const { data: contract } = await supabase
        .from("contracts")
        .select("id, contract_number, is_prepaid, total_months_prepaid, prepaid_amount, tax_rate, bank_account, payment_schedule")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (contract) {
        setContractInfo(contract as ContractInfo);
        const { data: services } = await supabase
          .from("contract_services")
          .select("service_name, monthly_fee")
          .eq("contract_id", (contract as ContractInfo).id)
          .eq("status", "active");
        setContractServices((services as ContractServiceInfo[]) || []);
      }
    } catch {
      // silent fail
    }
  }

  // ── Auto-fill items from contract ──
  function autoFillFromContract() {
    if (!contractInfo) return;

    if (contractInfo.is_prepaid && contractInfo.total_months_prepaid > 0) {
      // Prepaid: single line item for full prepaid amount
      const monthlyFee = contractServices.reduce((s, svc) => s + svc.monthly_fee, 0);
      setForm((prev) => ({
        ...prev,
        items: [
          {
            description: contractServices.length > 0
              ? contractServices.map((s) => s.service_name).join(", ")
              : "Digital Advertising Management",
            quantity: contractInfo.total_months_prepaid,
            unit_price: monthlyFee,
          },
        ],
        tax: contractInfo.tax_rate
          ? Math.round((contractInfo.prepaid_amount * contractInfo.tax_rate) / 100).toString()
          : prev.tax,
      }));
      toast.success(`Auto-fill dari kontrak: ${contractInfo.total_months_prepaid} bulan prepaid`);
    } else {
      // Monthly: one item per service or single summary
      if (contractServices.length > 0) {
        setForm((prev) => ({
          ...prev,
          items: contractServices.map((svc) => ({
            description: svc.service_name,
            quantity: 1,
            unit_price: svc.monthly_fee,
          })),
          tax: contractInfo.tax_rate
            ? Math.round((itemsSubtotal * contractInfo.tax_rate) / 100).toString()
            : prev.tax,
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          items: [{ description: "Digital Advertising Management", quantity: 1, unit_price: 0 }],
        }));
      }
      toast.success("Auto-fill dari kontrak: Monthly billing");
    }
  }

  // ── Line items handlers ──
  function handleItemChange(idx: number, field: keyof InvoiceItem, value: string | number) {
    setForm((prev) => {
      const updated = [...prev.items];
      if (field === "description") {
        updated[idx] = { ...updated[idx], description: value as string };
      } else {
        updated[idx] = { ...updated[idx], [field]: parseFloat(value as string) || 0 };
      }
      return { ...prev, items: updated };
    });
  }

  function addLineItem() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, unit_price: 0 }],
    }));
  }

  function removeLineItem(idx: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1
        ? prev.items.filter((_, i) => i !== idx)
        : prev.items,
    }));
  }

  function generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `INV-${year}${month}-${random}`;
  }

  function openCreate() {
    setEditingId(null);
    setContractInfo(null);
    setContractServices([]);
    setForm({
      ...emptyForm,
      invoice_number: generateInvoiceNumber(),
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      items: [{ description: "", quantity: 1, unit_price: 0 }],
    });
    setShowModal(true);
  }

  function openEdit(invoice: Invoice) {
    setEditingId(invoice.id);
    setContractInfo(null);
    setContractServices([]);
    setForm({
      client_id: invoice.client_id,
      is_new_client: false,
      new_client_name: "",
      new_client_email: "",
      new_client_phone: "",
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      tax: invoice.tax?.toString() || "",
      status: invoice.status,
      notes: invoice.notes || "",
      items: invoice.items?.length
        ? invoice.items
        : [{ description: "Digital Advertising Management", quantity: 1, unit_price: invoice.amount }],
    });
    fetchContractForClient(invoice.client_id);
    setShowModal(true);
  }

  // ── Handle client selection ──
  function handleClientChange(value: string) {
    if (value === "__new__") {
      setForm((prev) => ({
        ...prev,
        is_new_client: true,
        client_id: "",
      }));
      setContractInfo(null);
      setContractServices([]);
    } else {
      setForm((prev) => ({
        ...prev,
        is_new_client: false,
        client_id: value,
      }));
      fetchContractForClient(value);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Validate
    if (form.is_new_client) {
      if (!form.new_client_name.trim()) {
        toast.error("Nama client baru wajib diisi");
        return;
      }
    } else if (!form.client_id) {
      toast.error("Pilih client atau tambah client baru");
      return;
    }

    if (!form.invoice_number || !form.due_date) {
      toast.error("Nomor invoice dan jatuh tempo wajib diisi");
      return;
    }

    // Validate items
    const validItems = form.items.filter(
      (item) => item.description.trim() && item.unit_price > 0
    );
    if (validItems.length === 0) {
      toast.error("Minimal 1 item layanan dengan deskripsi dan harga");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      let clientId = form.client_id;

      // Create new client first if needed
      if (form.is_new_client) {
        // Generate slug from name: "SAMA Kreatik" → "sama-kreatik"
        const clientName = form.new_client_name.trim();
        const slug = clientName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

        const insertData: Record<string, string> = {
          name: clientName,
          slug: slug,
        };
        // Add email/phone if provided (requires migration-v62 columns)
        if (form.new_client_email.trim()) {
          insertData.email = form.new_client_email.trim();
        }
        if (form.new_client_phone.trim()) {
          insertData.phone = form.new_client_phone.trim();
        }

        const result = await supabase
          .from("clients")
          .insert(insertData as never)
          .select("id")
          .single();

        if (result.error) throw result.error;
        clientId = (result.data as { id: string })?.id || "";
      }

      const subtotal = validItems.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0
      );

      const payload = {
        client_id: clientId,
        invoice_number: form.invoice_number,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount: subtotal,
        tax: taxAmount,
        status: form.status,
        notes: form.notes.trim() || null,
        items: validItems,
        paid_date: form.status === "paid" ? new Date().toISOString().split("T")[0] : null,
        created_by: editingId ? undefined : userData.user?.id,
      };

      if (editingId) {
        const { error } = await supabase
          .from("invoices")
          .update(payload as never)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Invoice diupdate!");
      } else {
        const { error } = await supabase.from("invoices").insert(payload as never);
        if (error) throw error;
        toast.success("Invoice dibuat!");
      }

      setShowModal(false);
      loadInvoices();
      loadClients(); // refresh client list if new was added
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal menyimpan: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus invoice ini?")) return;
    try {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      toast.success("Invoice dihapus");
      loadInvoices();
    } catch (err) {
      const msg = extractError(err);
      toast.error("Gagal hapus: " + msg);
    }
  }

  async function quickStatus(id: string, status: string) {
    const payload: Record<string, unknown> = { status };
    if (status === "paid") payload.paid_date = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("invoices").update(payload as never).eq("id", id);
    if (error) {
      toast.error("Gagal update status");
    } else {
      toast.success("Status → " + statusLabels[status]);
      loadInvoices();
    }
  }

  const filtered = invoices.filter((inv) => {
    const matchSearch =
      !search ||
      inv.client?.name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchClient = clientFilter === "all" || inv.client_id === clientFilter;
    return matchSearch && matchStatus && matchClient;
  });

  // Stats
  const totalAmount = filtered.reduce((s, i) => s + i.amount, 0);
  const paidAmount = filtered.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstandingAmount = filtered
    .filter((i) => i.status === "sent")
    .reduce((s, i) => s + i.amount, 0);
  const overdueCount = filtered.filter((i) => i.status === "overdue").length;
  const todayStr = new Date().toISOString().split("T")[0];

  const statCards = [
    {
      label: "Total Invoiced",
      value: formatIDR(totalAmount),
      sub: `${filtered.length} invoices`,
      icon: FileText,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Paid",
      value: formatIDR(paidAmount),
      sub: `${((paidAmount / (totalAmount || 1)) * 100).toFixed(0)}% collected`,
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Outstanding",
      value: formatIDR(outstandingAmount),
      sub: "awaiting payment",
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Overdue",
      value: overdueCount.toString(),
      sub: "needs attention",
      icon: AlertCircle,
      color: "text-danger",
      bg: "bg-danger/10",
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Invoices</h1>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Invoices</h1>
          <p className="text-sm text-muted">Kelola tagihan & pembayaran client</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card p-4">
              <div className={cn("mb-2 inline-flex rounded-lg p-2", card.bg)}>
                <Icon className={card.color} size={18} />
              </div>
              <p className="text-xs text-muted">{card.label}</p>
              <p className="mt-0.5 text-lg font-bold text-foreground">{card.value}</p>
              <p className="mt-0.5 text-[10px] text-muted">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari nomor invoice atau client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Invoice Table */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada invoice</p>
          <button onClick={openCreate} className="btn-primary mt-4">
            <Plus size={16} /> Buat Invoice Pertama
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr className="text-left text-xs uppercase text-muted">
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Issue Date</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => {
                const isOverdue = inv.status === "sent" && inv.due_date < todayStr;
                return (
                  <tr key={inv.id} className="group hover:bg-surface/50">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-foreground">{inv.client?.name || "-"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-muted", isOverdue && "font-medium text-danger")}>
                        {formatDate(inv.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatIDR(inv.amount + inv.tax)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("badge", statusColors[inv.status])}>
                        {isOverdue ? "Overdue" : statusLabels[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "sent" && (
                          <button
                            onClick={() => quickStatus(inv.id, "paid")}
                            className="rounded p-1.5 text-muted hover:bg-background hover:text-success"
                            title="Tandai Lunas"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Download PDF"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handlePrint(inv)}
                          className="rounded p-1.5 text-muted hover:bg-background hover:text-primary"
                          title="Print"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(inv)}
                          className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-background hover:text-primary group-hover:opacity-100"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(inv.id)}
                          className="rounded p-1.5 text-muted opacity-0 transition-opacity hover:bg-background hover:text-danger group-hover:opacity-100"
                          title="Hapus"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Sticky Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-6 py-4">
              <h2 className="text-lg font-bold text-foreground">
                {editingId ? "Edit Invoice" : "Invoice Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">

                {/* Invoice Number + Client */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Nomor Invoice *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.invoice_number}
                      onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                      className="input font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client *</label>
                    <select
                      required
                      value={form.is_new_client ? "__new__" : form.client_id}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="input"
                    >
                      <option value="">— Pilih Client —</option>
                      <option value="__new__">+ Tambah Client Baru</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* New Client Inline Form */}
                {form.is_new_client && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-primary">
                      <UserPlus size={14} /> Client Baru
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-3 sm:col-span-1">
                        <label className="mb-1 block text-xs text-muted">Nama *</label>
                        <input
                          type="text"
                          required={form.is_new_client}
                          value={form.new_client_name}
                          onChange={(e) => setForm({ ...form, new_client_name: e.target.value })}
                          placeholder="PT. Contoh"
                          className="input text-sm"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <label className="mb-1 block text-xs text-muted">Email</label>
                        <input
                          type="email"
                          value={form.new_client_email}
                          onChange={(e) => setForm({ ...form, new_client_email: e.target.value })}
                          placeholder="email@contoh.com"
                          className="input text-sm"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-1">
                        <label className="mb-1 block text-xs text-muted">Phone</label>
                        <input
                          type="text"
                          value={form.new_client_phone}
                          onChange={(e) => setForm({ ...form, new_client_phone: e.target.value })}
                          placeholder="081xxx"
                          className="input text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Contract Info + Auto-fill */}
                {contractInfo && !form.is_new_client && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <FileSignature className="mt-0.5 shrink-0 text-primary" size={16} />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Kontrak Aktif: {contractInfo.contract_number || "—"}
                          </p>
                          <p className="text-xs text-muted">
                            {contractInfo.is_prepaid
                              ? `Prepaid ${contractInfo.total_months_prepaid} bulan · ${formatIDR(contractInfo.prepaid_amount)}`
                              : `Monthly · ${contractServices.length} layanan · ${formatIDR(contractServices.reduce((s, svc) => s + svc.monthly_fee, 0))}/bln`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={autoFillFromContract}
                        className="btn-primary shrink-0 text-xs"
                      >
                        <Sparkles size={12} /> Isi dari Kontrak
                      </button>
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Tanggal Invoice
                    </label>
                    <input
                      type="date"
                      value={form.issue_date}
                      onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Jatuh Tempo *
                    </label>
                    <input
                      type="date"
                      required
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* ── LINE ITEMS BUILDER ── */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-foreground">
                      Detail Layanan / Items
                    </label>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                    >
                      <Plus size={12} /> Tambah Item
                    </button>
                  </div>

                  {/* Items Table */}
                  <div className="overflow-hidden rounded-lg border border-border">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-1 border-b border-border bg-surface px-2 py-2 text-[10px] font-semibold uppercase text-muted">
                      <div className="col-span-5 px-1">Service / Description</div>
                      <div className="col-span-2 px-1 text-center">Qty</div>
                      <div className="col-span-2 px-1 text-right">Unit Price</div>
                      <div className="col-span-2 px-1 text-right">Amount</div>
                      <div className="col-span-1"></div>
                    </div>
                    {/* Rows */}
                    {form.items.map((item, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "grid grid-cols-12 items-center gap-1 px-2 py-2",
                          idx % 2 === 1 && "bg-surface/50"
                        )}
                      >
                        <div className="col-span-5 px-1">
                          <input
                            type="text"
                            list="service-options"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            placeholder="Pilih atau ketik layanan..."
                            className="w-full rounded border border-border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
                          />
                          <datalist id="service-options">
                            {SERVICE_OPTIONS.map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        </div>
                        <div className="col-span-2 px-1">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className="no-spinner w-full rounded border border-border bg-background px-2 py-1 text-center text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2 px-1">
                          <input
                            type="number"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(idx, "unit_price", e.target.value)}
                            placeholder="0"
                            className="no-spinner w-full rounded border border-border bg-background px-2 py-1 text-right text-sm focus:border-primary focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2 px-1 text-right text-sm font-medium text-foreground">
                          {formatIDR((item.quantity || 0) * (item.unit_price || 0))}
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => removeLineItem(idx)}
                            disabled={form.items.length === 1}
                            className="rounded p-1 text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tax + Status */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Pajak/PPh (Rp)
                    </label>
                    <input
                      type="number"
                      value={form.tax}
                      onChange={(e) => setForm({ ...form, tax: e.target.value })}
                      placeholder="0"
                      className="no-spinner input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="input"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {/* Total Summary */}
                <div className="space-y-1.5 rounded-lg border border-border bg-background p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Subtotal (otomatis dari items)</span>
                    <span className="font-medium text-foreground">{formatIDR(itemsSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Pajak/PPh</span>
                    <span className="font-medium text-foreground">{formatIDR(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-sm font-bold text-foreground">Total</span>
                    <span className="text-lg font-bold text-primary">{formatIDR(grandTotal)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Catatan</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Catatan untuk client..."
                    className="input resize-none"
                  />
                </div>

              </div>

              {/* Sticky Footer */}
              <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menyimpan...
                    </>
                  ) : editingId ? (
                    "Update Invoice"
                  ) : (
                    "Simpan Invoice"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Area */}
      <PrintableInvoice invoice={printInvoice} />
    </div>
  );
}