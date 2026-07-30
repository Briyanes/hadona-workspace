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
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn, formatDate, formatIDR, extractError } from "@/lib/utils";

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
  invoice_number: "",
  issue_date: new Date().toISOString().split("T")[0],
  due_date: "",
  amount: "",
  tax: "",
  status: "draft",
  notes: "",
  items: [] as InvoiceItem[],
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

  function generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `INV-${year}${month}-${random}`;
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      invoice_number: generateInvoiceNumber(),
      due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    });
    setShowModal(true);
  }

  function openEdit(invoice: Invoice) {
    setEditingId(invoice.id);
    setForm({
      client_id: invoice.client_id,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      amount: invoice.amount.toString(),
      tax: invoice.tax?.toString() || "",
      status: invoice.status,
      notes: invoice.notes || "",
      items: invoice.items || [],
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || !form.invoice_number || !form.due_date) {
      toast.error("Client, nomor invoice, dan due date wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        client_id: form.client_id,
        invoice_number: form.invoice_number,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount: parseFloat(form.amount) || 0,
        tax: form.tax ? parseFloat(form.tax) : 0,
        status: form.status,
        notes: form.notes.trim() || null,
        items: form.items,
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
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
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
              <p className="mt-0.5 text-lg font-bold text-gray-900">{card.value}</p>
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
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{inv.client?.name || "-"}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(inv.issue_date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-muted", isOverdue && "font-medium text-danger")}>
                        {formatDate(inv.due_date)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? "Edit Invoice" : "Invoice Baru"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-gray-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Client *</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih Client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
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
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
                    Subtotal (Rp)
                  </label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">
                    Pajak/PPh (Rp)
                  </label>
                  <input
                    type="number"
                    value={form.tax}
                    onChange={(e) => setForm({ ...form, tax: e.target.value })}
                    placeholder="0"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-900">Status</label>
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

              <div className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">Total (Subtotal + Pajak):</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatIDR(
                      (parseFloat(form.amount) || 0) + (parseFloat(form.tax) || 0)
                    )}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">Catatan</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Catatan untuk client..."
                  className="input resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-gray-900"
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
    </div>
  );
}