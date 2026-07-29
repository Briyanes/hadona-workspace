"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, X, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContentPlan {
  id: string;
  month: string;
  plan_url: string | null;
  services: string[];
  notes: string | null;
  created_at: string;
  client?: { name: string };
}

interface Client {
  id: string;
  name: string;
}

const SERVICE_OPTIONS = ["Meta Ads", "Google Ads", "TikTok", "SEO", "Content", "Social Media", "Web Dev"];

export default function ContentPlansPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<ContentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    month: "",
    plan_url: "",
    notes: "",
    services: [] as string[],
  });

  useEffect(() => {
    loadPlans();
    loadClients();
  }, [supabase]);

  async function loadPlans() {
    const { data } = await supabase
      .from("content_plans")
      .select("*, client:clients(name)")
      .order("created_at", { ascending: false });
    setPlans((data as unknown as ContentPlan[]) || []);
    setLoading(false);
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
    setClients((data as unknown as Client[]) || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id || !form.month) {
      toast.error("Client dan Bulan wajib diisi");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("content_plans").insert({
      client_id: form.client_id,
      month: form.month,
      plan_url: form.plan_url || null,
      services: form.services,
      notes: form.notes.trim() || null,
    } as never);

    if (error) {
      toast.error("Gagal: " + error.message);
    } else {
      toast.success("Content plan dibuat!");
      setForm({ client_id: "", month: "", plan_url: "", notes: "", services: [] });
      setShowModal(false);
      loadPlans();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus content plan ini?")) return;
    const { error } = await supabase.from("content_plans").delete().eq("id", id);
    if (error) {
      toast.error("Gagal hapus: " + error.message);
    } else {
      toast.success("Plan dihapus");
      loadPlans();
    }
  }

  function toggleService(service: string) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Plans</h1>
          <p className="text-sm text-muted">Content calendar & plan per klien</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus size={16} /> New Plan
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-lg" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="mb-3 text-muted" size={32} />
          <p className="text-muted">Belum ada content plan</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
            <Plus size={16} /> Buat Plan Pertama
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="card">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{p.client?.name || "Unknown"}</h3>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <CalendarDays size={12} /> {p.month}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="rounded p-1.5 text-muted hover:bg-background hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {p.services.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {p.services.map((s) => (
                    <span key={s} className="badge bg-background text-muted">{s}</span>
                  ))}
                </div>
              )}

              {p.notes && <p className="mb-3 text-sm text-muted">{p.notes}</p>}

              {p.plan_url && (
                <a
                  href={p.plan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink size={12} /> Lihat Content Plan
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-8 w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Content Plan Baru</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-muted hover:bg-background hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Client *</label>
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

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Bulan *</label>
                <input
                  type="month"
                  required
                  value={form.month}
                  onChange={(e) => setForm({ ...form, month: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white">Services</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        form.services.includes(s)
                          ? "bg-primary text-white"
                          : "bg-background text-muted hover:text-white"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Plan URL (Google Sheets/Drive)</label>
                <input
                  type="url"
                  value={form.plan_url}
                  onChange={(e) => setForm({ ...form, plan_url: e.target.value })}
                  placeholder="https://docs.google.com/..."
                  className="input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white">Catatan</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                  className="input resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-white"
                >
                  Batal
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? "Menyimpan..." : "Simpan Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}