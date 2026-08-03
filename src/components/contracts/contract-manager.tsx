"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  X,
  Loader2,
  Trash2,
  DollarSign,
  Calendar,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  Upload,
  Download,
  RefreshCw,
} from "lucide-react";
import { cn, formatIDR, formatDate } from "@/lib/utils";

// ============================================
// Types
// ============================================
interface Contract {
  id: string;
  client_id: string;
  contract_number: string | null;
  start_date: string;
  end_date: string;
  minimum_months: number;
  status: string;
  contract_type: string;
  notes: string | null;
  signed_url: string | null;
  pic_name: string | null;
  pic_phone: string | null;
  pic_email: string | null;
  sales_person_id: string | null;
  payment_due_day: number;
  bank_account: string | null;
  discount_percent: number;
  tax_rate: number;
  created_at: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  email: string;
  division: string | null;
}

interface ContractService {
  id: string;
  contract_id: string;
  service_name: string;
  monthly_fee: number;
  effective_from: string;
  effective_to: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface Billing {
  id: string;
  contract_id: string;
  billing_period: string;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  services_snapshot: { service: string; fee: number }[] | null;
}

// ============================================
// Constants
// ============================================
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
];

const contractStatusColors: Record<string, string> = {
  draft: "bg-surface text-muted",
  active: "bg-success/20 text-success",
  expired: "bg-danger/20 text-danger",
  terminated: "bg-danger/20 text-danger",
  renewed: "bg-primary/20 text-primary",
};

const billingStatusColors: Record<string, string> = {
  unpaid: "bg-warning/20 text-warning",
  paid: "bg-success/20 text-success",
  overdue: "bg-danger/20 text-danger",
  cancelled: "bg-surface text-muted",
};

// ============================================
// Main Component
// ============================================
export function ContractManager({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [services, setServices] = useState<Record<string, ContractService[]>>({});
  const [billings, setBillings] = useState<Record<string, Billing[]>>({});
  const [loading, setLoading] = useState(true);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState<string | null>(null);
  const [expandedContract, setExpandedContract] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [contractForm, setContractForm] = useState({
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    minimum_months: 3,
    contract_type: "monthly",
    notes: "",
    pic_name: "",
    pic_phone: "",
    pic_email: "",
    sales_person_id: "",
    payment_due_day: 14,
    bank_account: "BCA",
    discount_percent: 0,
    tax_rate: 11,
  });

  const [serviceForm, setServiceForm] = useState({
    service_name: "",
    monthly_fee: "",
    effective_from: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: contractData, error } = await supabase
        .from("client_contracts")
        .select("*")
        .eq("client_id", clientId as never)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const contractList = (contractData as unknown as Contract[]) || [];
      setContracts(contractList);

      // Load services and billings for each contract
      const servicesMap: Record<string, ContractService[]> = {};
      const billingsMap: Record<string, Billing[]> = {};

      for (const c of contractList) {
        const [{ data: svc }, { data: bil }] = await Promise.all([
          supabase
            .from("contract_services")
            .select("*")
            .eq("contract_id", c.id as never)
            .order("created_at", { ascending: true }),
          supabase
            .from("contract_billings")
            .select("*")
            .eq("contract_id", c.id as never)
            .order("billing_period", { ascending: true }),
        ]);

        servicesMap[c.id] = (svc as unknown as ContractService[]) || [];
        billingsMap[c.id] = (bil as unknown as Billing[]) || [];
      }

      setServices(servicesMap);
      setBillings(billingsMap);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal memuat kontrak: " + msg);
    } finally {
      setLoading(false);
    }
  }, [clientId, supabase]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // Load team members for sales/AM dropdown
  useEffect(() => {
    async function loadTeam() {
      try {
        const { data, error } = await supabase
          .from("team_members")
          .select("id, full_name, email, division")
          .order("full_name", { ascending: true });
        if (error) throw error;
        setTeamMembers((data as unknown as TeamMember[]) || []);
      } catch {
        // Silent fail — dropdown just empty
      }
    }
    loadTeam();
  }, [supabase]);

  // ============================================
  // Contract CRUD
  // ============================================
  async function handleCreateContract(e: React.FormEvent) {
    e.preventDefault();
    if (!contractForm.end_date) {
      toast.error("Tanggal akhir kontrak wajib diisi");
      return;
    }
    setSaving(true);
    try {
      // Get current user for audit trail
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("client_contracts").insert({
        client_id: clientId,
        start_date: contractForm.start_date,
        end_date: contractForm.end_date,
        minimum_months: contractForm.minimum_months,
        contract_type: contractForm.contract_type,
        notes: contractForm.notes || null,
        status: "active",
        created_by: user?.id || null,
        pic_name: contractForm.pic_name || null,
        pic_phone: contractForm.pic_phone || null,
        pic_email: contractForm.pic_email || null,
        sales_person_id: contractForm.sales_person_id || null,
        payment_due_day: contractForm.payment_due_day,
        bank_account: contractForm.bank_account,
        discount_percent: contractForm.discount_percent,
        tax_rate: contractForm.tax_rate,
      } as never);
      if (error) throw error;
      toast.success("Kontrak berhasil dibuat!");
      setShowContractModal(false);
      setContractForm({
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        minimum_months: 3,
        contract_type: "monthly",
        notes: "",
        pic_name: "",
        pic_phone: "",
        pic_email: "",
        sales_person_id: "",
        payment_due_day: 14,
        bank_account: "BCA",
        discount_percent: 0,
        tax_rate: 11,
      });
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal membuat kontrak: " + msg);
    } finally {
      setSaving(false);
    }
  }

  // ============================================
  // Contract Renewal & Document Upload
  // ============================================
  async function handleRenewContract(contract: Contract) {
    const startDate = contract.end_date;
    const defaultEnd = new Date(startDate);
    defaultEnd.setMonth(defaultEnd.getMonth() + contract.minimum_months);
    const endDate = defaultEnd.toISOString().slice(0, 10);

    if (!confirm(`Perpanjang kontrak?\nMulai: ${startDate}\nSampai: ${endDate}\n(${contract.minimum_months} bulan)`)) return;

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create new contract as renewal
      const { error } = await supabase.from("client_contracts").insert({
        client_id: contract.client_id,
        start_date: startDate,
        end_date: endDate,
        minimum_months: contract.minimum_months,
        contract_type: contract.contract_type,
        notes: `Perpanjangan dari ${contract.contract_number || "kontrak sebelumnya"}`,
        status: "active",
        created_by: user?.id || null,
      } as never);

      if (error) throw error;

      // Mark old contract as renewed
      await supabase
        .from("client_contracts")
        .update({ status: "renewed" } as never)
        .eq("id", contract.id as never);

      toast.success("Kontrak diperpanjang! Services perlu ditambahkan ke kontrak baru.");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal memperpanjang: " + msg);
    }
  }

  async function handleUploadDocument(contractId: string, file: File) {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `contracts/${contractId}/signed-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("client_contracts")
        .update({ signed_url: urlData.publicUrl } as never)
        .eq("id", contractId as never);

      if (updateError) throw updateError;

      toast.success("Dokumen kontrak diupload!");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal upload: " + msg);
    }
  }

  async function handleDeleteContract(id: string) {
    if (!confirm("Hapus kontrak ini? Semua data service & billing akan terhapus.")) return;
    try {
      const { error } = await supabase.from("client_contracts").delete().eq("id", id as never);
      if (error) throw error;
      toast.success("Kontrak dihapus");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal hapus: " + msg);
    }
  }

  // ============================================
  // Service CRUD
  // ============================================
  async function handleAddService(e: React.FormEvent, contractId: string) {
    e.preventDefault();
    if (!serviceForm.service_name || !serviceForm.monthly_fee) {
      toast.error("Nama service dan harga wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("contract_services").insert({
        contract_id: contractId,
        service_name: serviceForm.service_name,
        monthly_fee: parseFloat(serviceForm.monthly_fee),
        effective_from: serviceForm.effective_from,
        notes: serviceForm.notes || null,
        status: "active",
      } as never);
      if (error) throw error;
      toast.success("Service ditambahkan!");
      setShowServiceModal(null);
      setServiceForm({
        service_name: "",
        monthly_fee: "",
        effective_from: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal menambah service: " + msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleEndService(serviceId: string) {
    if (!confirm("Akhiri service ini? Billing bulan depan tidak akan include service ini.")) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("contract_services")
        .update({ effective_to: today, status: "ended" } as never)
        .eq("id", serviceId as never);
      if (error) throw error;
      toast.success("Service diakhiri");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal mengakhiri service: " + msg);
    }
  }

  async function handleDeleteService(serviceId: string) {
    if (!confirm("Hapus service ini?")) return;
    try {
      const { error } = await supabase.from("contract_services").delete().eq("id", serviceId as never);
      if (error) throw error;
      toast.success("Service dihapus");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal hapus: " + msg);
    }
  }

  // ============================================
  // Billing Actions
  // ============================================
  async function handleGenerateBilling(contractId: string, period: string) {
    try {
      const { data, error } = await supabase.rpc("generate_monthly_billing", {
        p_contract_id: contractId,
        p_period: period,
      } as never);
      if (error) throw error;
      toast.success(`Billing ${period} dibuat!`);
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal generate billing: " + msg);
    }
  }

  async function handleMarkPaid(billingId: string) {
    try {
      const { error } = await supabase
        .from("contract_billings")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: "transfer",
        } as never)
        .eq("id", billingId as never);
      if (error) throw error;
      toast.success("Pembayaran ditandai lunas!");
      loadContracts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Gagal update: " + msg);
    }
  }

  // ============================================
  // Helpers
  // ============================================
  function calculateMonthlyTotal(contractId: string): number {
    return (services[contractId] || [])
      .filter((s) => s.status === "active" && (!s.effective_to || new Date(s.effective_to) >= new Date()))
      .reduce((sum, s) => sum + s.monthly_fee, 0);
  }

  function getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function getNextPeriod(): string {
    const now = new Date();
    now.setMonth(now.getMonth() + 1);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  // ============================================
  // Render
  // ============================================
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-40 rounded-lg" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Kontrak & Billing</h3>
          <p className="text-xs text-muted">Kelola kontrak, service, dan tagihan bulanan</p>
        </div>
        <button onClick={() => setShowContractModal(true)} className="btn-primary text-xs">
          <Plus size={14} /> Buat Kontrak
        </button>
      </div>

      {/* Empty State */}
      {contracts.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <FileText className="mb-3 text-muted" size={32} />
          <p className="text-sm text-muted">Belum ada kontrak untuk client ini</p>
          <button onClick={() => setShowContractModal(true)} className="btn-primary mt-4 text-xs">
            <Plus size={14} /> Buat Kontrak Pertama
          </button>
        </div>
      )}

      {/* Contract Cards */}
      {contracts.map((contract) => {
        const svcList = services[contract.id] || [];
        const bilList = billings[contract.id] || [];
        const monthlyTotal = calculateMonthlyTotal(contract.id);
        const isExpanded = expandedContract === contract.id;

        return (
          <div key={contract.id} className="card overflow-hidden">
            {/* Contract Header */}
            <div
              className="flex cursor-pointer items-center justify-between p-4 hover:bg-surface"
              onClick={() => setExpandedContract(isExpanded ? null : contract.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {contract.contract_number || "Kontrak"}
                    </p>
                    <span className={cn("badge text-[10px]", contractStatusColors[contract.status] || contractStatusColors.draft)}>
                      {contract.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDate(contract.start_date)} → {formatDate(contract.end_date)} • Min {contract.minimum_months} bulan
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-success">{formatIDR(monthlyTotal)}</p>
                <p className="text-[10px] text-muted">MRR (bulan ini)</p>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-border">
                {/* Services Section */}
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Active Services ({svcList.filter((s) => s.status === "active").length})
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowServiceModal(contract.id);
                      }}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Plus size={12} /> Add Service
                    </button>
                  </div>

                  {svcList.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">Belum ada service. Tambahkan service pertama!</p>
                  ) : (
                    <div className="space-y-1.5">
                      {svcList.map((svc) => (
                        <div
                          key={svc.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border p-2.5",
                            svc.status === "active" ? "border-border bg-surface" : "border-border bg-surface opacity-50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <DollarSign size={14} className="text-success" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{svc.service_name}</p>
                              <p className="text-[10px] text-muted">
                                Dari {formatDate(svc.effective_from, { month: "short", year: "numeric" })}
                                {svc.effective_to && ` → ${formatDate(svc.effective_to, { month: "short", year: "numeric" })}`}
                              </p>
                              {svc.notes && <p className="text-[10px] italic text-muted">"{svc.notes}"</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{formatIDR(svc.monthly_fee)}/bln</p>
                            {svc.status === "active" && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEndService(svc.id);
                                  }}
                                  className="rounded p-1 text-muted hover:bg-background hover:text-warning"
                                  title="Akhiri service"
                                >
                                  <Clock size={12} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteService(svc.id);
                                  }}
                                  className="rounded p-1 text-muted hover:bg-background hover:text-danger"
                                  title="Hapus"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* MRR Trend */}
                  {svcList.length > 1 && (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-success/10 p-2 text-xs">
                      <TrendingUp size={14} className="text-success" />
                      <span className="text-success">
                        Total MRR: <strong>{formatIDR(monthlyTotal)}/bulan</strong> (PPN 11%: {formatIDR(monthlyTotal * 0.11)})
                      </span>
                    </div>
                  )}
                </div>

                {/* Billing Section */}
                <div className="border-t border-border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Billing History ({bilList.length})
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateBilling(contract.id, getCurrentPeriod());
                        }}
                        className="flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[10px] text-muted hover:text-primary"
                      >
                        <CreditCard size={10} /> Gen {getCurrentPeriod()}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateBilling(contract.id, getNextPeriod());
                        }}
                        className="flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[10px] text-muted hover:text-primary"
                      >
                        <CreditCard size={10} /> Gen {getNextPeriod()}
                      </button>
                    </div>
                  </div>

                  {bilList.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">
                      Belum ada billing. Klik "Gen" untuk generate billing bulanan.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {bilList.map((bil) => (
                        <div
                          key={bil.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border border-border p-2.5",
                            bil.status === "paid" ? "bg-success/5" : bil.status === "overdue" ? "bg-danger/5" : "bg-surface"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {bil.status === "paid" ? (
                              <CheckCircle size={14} className="text-success" />
                            ) : bil.status === "overdue" ? (
                              <AlertCircle size={14} className="text-danger" />
                            ) : (
                              <Clock size={14} className="text-warning" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{bil.billing_period}</p>
                                <span className={cn("badge text-[9px]", billingStatusColors[bil.status] || billingStatusColors.unpaid)}>
                                  {bil.status}
                                </span>
                              </div>
                              {bil.services_snapshot && bil.services_snapshot.length > 0 && (
                                <p className="text-[10px] text-muted">
                                  {bil.services_snapshot.map((s) => s.service).join(", ")}
                                </p>
                              )}
                              {bil.due_date && bil.status === "unpaid" && (
                                <p className="text-[10px] text-warning">Jatuh tempo: {formatDate(bil.due_date)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-sm font-bold text-gray-900">{formatIDR(bil.grand_total)}</p>
                              <p className="text-[10px] text-muted">
                                {formatIDR(bil.total_amount)} + PPN {formatIDR(bil.tax_amount)}
                              </p>
                            </div>
                            {bil.status === "unpaid" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkPaid(bil.id);
                                }}
                                className="rounded-md bg-success px-2 py-1 text-[10px] font-medium text-white hover:bg-success/90"
                              >
                                Tandai Lunas
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Document & Actions */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
                  {/* Upload Document */}
                  <label className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] text-primary hover:bg-primary/10">
                    <Upload size={10} />
                    {contract.signed_url ? "Ganti Dokumen" : "Upload Dokumen"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        e.stopPropagation();
                        const f = e.target.files?.[0];
                        if (f) handleUploadDocument(contract.id, f);
                      }}
                    />
                  </label>

                  {/* Download Document */}
                  {contract.signed_url && (
                    <a
                      href={contract.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted hover:bg-surface"
                    >
                      <Download size={10} /> Lihat Dokumen
                    </a>
                  )}

                  {/* Renew Contract */}
                  {(contract.status === "active" || contract.status === "expired") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenewContract(contract);
                      }}
                      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-success hover:bg-success/10"
                    >
                      <RefreshCw size={10} /> Perpanjang
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteContract(contract.id);
                    }}
                    className="ml-auto flex items-center gap-1 text-[10px] text-danger hover:underline"
                  >
                    <Trash2 size={10} /> Hapus
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ==================== Create Contract Modal ==================== */}
      {showContractModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Kontrak Baru</h2>
              <button onClick={() => setShowContractModal(false)} className="rounded p-1 text-muted hover:bg-background">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateContract} className="space-y-4 px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Mulai Kontrak *</label>
                  <input
                    type="date"
                    required
                    value={contractForm.start_date}
                    onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Akhir Kontrak *</label>
                  <input
                    type="date"
                    required
                    value={contractForm.end_date}
                    onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Minimum Bulan</label>
                  <input
                    type="number"
                    min={1}
                    value={contractForm.minimum_months}
                    onChange={(e) => setContractForm({ ...contractForm, minimum_months: parseInt(e.target.value) || 3 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Tipe Kontrak</label>
                  <select
                    value={contractForm.contract_type}
                    onChange={(e) => setContractForm({ ...contractForm, contract_type: e.target.value })}
                    className="input"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semi-annual">Semi-Annual</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
              </div>
              {/* Section: PIC Client */}
              <div className="rounded-md border border-border bg-background/50 p-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">PIC Client</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-900">Nama PIC</label>
                    <input
                      type="text"
                      value={contractForm.pic_name}
                      onChange={(e) => setContractForm({ ...contractForm, pic_name: e.target.value })}
                      placeholder="John Doe"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-900">No. HP / WA</label>
                    <input
                      type="tel"
                      value={contractForm.pic_phone}
                      onChange={(e) => setContractForm({ ...contractForm, pic_phone: e.target.value })}
                      placeholder="0812xxxxxxx"
                      className="input"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-gray-900">Email PIC</label>
                  <input
                    type="email"
                    value={contractForm.pic_email}
                    onChange={(e) => setContractForm({ ...contractForm, pic_email: e.target.value })}
                    placeholder="john@client.com"
                    className="input"
                  />
                </div>
              </div>

              {/* Section: Sales & Payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Sales / AM</label>
                  <select
                    value={contractForm.sales_person_id}
                    onChange={(e) => setContractForm({ ...contractForm, sales_person_id: e.target.value })}
                    className="input"
                  >
                    <option value="">— Pilih —</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name || m.email} {m.division ? `(${m.division})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Jatuh Tempo (tgl)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={contractForm.payment_due_day}
                    onChange={(e) => setContractForm({ ...contractForm, payment_due_day: parseInt(e.target.value) || 14 })}
                    className="input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Bank</label>
                  <select
                    value={contractForm.bank_account}
                    onChange={(e) => setContractForm({ ...contractForm, bank_account: e.target.value })}
                    className="input"
                  >
                    <option value="BCA">BCA</option>
                    <option value="Mandiri">Mandiri</option>
                    <option value="BNI">BNI</option>
                    <option value="BRI">BRI</option>
                    <option value="CIMB">CIMB</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Diskon (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={contractForm.discount_percent}
                    onChange={(e) => setContractForm({ ...contractForm, discount_percent: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">PPN (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={contractForm.tax_rate}
                    onChange={(e) => setContractForm({ ...contractForm, tax_rate: parseFloat(e.target.value) || 0 })}
                    className="input"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-900">Catatan</label>
                <textarea
                  rows={2}
                  value={contractForm.notes}
                  onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })}
                  placeholder="Catatan kontrak..."
                  className="input resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setShowContractModal(false)} className="px-4 py-2 text-sm text-muted hover:text-gray-900">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
                  ) : (
                    "Simpan Kontrak"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== Add Service Modal ==================== */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-4 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">Tambah Service</h2>
              <button onClick={() => setShowServiceModal(null)} className="rounded p-1 text-muted hover:bg-background">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => handleAddService(e, showServiceModal)}
              className="space-y-4 px-6 py-4"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-900">Service *</label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setServiceForm({ ...serviceForm, service_name: s })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        serviceForm.service_name === s ? "bg-primary text-white" : "bg-surface text-muted hover:text-gray-900"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={serviceForm.service_name}
                  onChange={(e) => setServiceForm({ ...serviceForm, service_name: e.target.value })}
                  placeholder="Atau ketik custom service..."
                  className="input mt-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Harga / Bulan (IDR) *</label>
                  <input
                    type="number"
                    required
                    value={serviceForm.monthly_fee}
                    onChange={(e) => setServiceForm({ ...serviceForm, monthly_fee: e.target.value })}
                    placeholder="1500000"
                    className="input"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">Berlaku Dari</label>
                  <input
                    type="date"
                    value={serviceForm.effective_from}
                    onChange={(e) => setServiceForm({ ...serviceForm, effective_from: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-900">Catatan</label>
                <textarea
                  rows={2}
                  value={serviceForm.notes}
                  onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                  placeholder="Contoh: Ditambahkan karena performa iklan winning"
                  className="input resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" onClick={() => setShowServiceModal(null)} className="px-4 py-2 text-sm text-muted hover:text-gray-900">
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Menyimpan...</>
                  ) : (
                    "Tambah Service"
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