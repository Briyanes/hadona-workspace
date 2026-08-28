"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface Client {
  id: string;
  name: string;
}

interface PreviewRow {
  no: number;
  pilar: string;
  konten: string;
  tema: string;
  copy: string;
  details: string;
  reference: string;
  caption: string;
  thumbnail: string;
  link_hasil: string;
  tanggal_upload: string;
  progress: string;
}

interface ImportSheetModalProps {
  clients: Client[];
  onClose: () => void;
  onImported: () => void;
}

export function ImportSheetModal({ clients, onClose, onImported }: ImportSheetModalProps) {
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [detectedClient, setDetectedClient] = useState<string>("");

  async function handlePreview() {
    if (!url.trim()) {
      toast.error("Tempel URL Google Sheet (published to web) terlebih dahulu");
      return;
    }
    setLoading(true);
    setRows(null);
    try {
      const res = await fetch("/api/content-plans/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), previewOnly: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal membaca sheet");
      setRows(json.rows || []);
      setDetectedClient(json.detectedClient || "");
      toast.success(`${(json.rows || []).length} baris terbaca dari sheet`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Preview gagal: " + msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!clientId) {
      toast.error("Pilih client tujuan import");
      return;
    }
    if (!month) {
      toast.error("Pilih bulan untuk plan ini");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/content-plans/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), previewOnly: false, clientId, month }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal import");
      toast.success(`Berhasil import ${json.count} baris ke Content Plans!`);
      onImported();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Import gagal: " + msg);
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      scrollable
      title="Import Google Sheet"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">
            Batal
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || rows === null || rows.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Mengimport...
              </>
            ) : (
              <>
                <Download size={14} /> Import {rows ? `${rows.length} Baris` : ""}
              </>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-primary/5 p-3 text-xs text-muted">
          Pastikan Google Sheet sudah <strong>"Publish to web"</strong> (File → Share → Publish to
          web). Kolom yang dikenali otomatis: No, Pillar/Pilar, Tipe/Konten, Tema, Copy, Details,
          Referensi/Reference, Caption, Thumbnail, Progress, Link Hasil, Tanggal Unggah/Upload.
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">URL Sheet Published *</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/e/.../pubhtml atau .../pub?output=csv"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={handlePreview}
              disabled={loading}
              className="btn-secondary shrink-0"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Preview
            </button>
          </div>
        </div>

        {rows !== null && (
          <>
            {detectedClient && (
              <div className="flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-xs text-success">
                <CheckCircle2 size={14} /> Sheet terdeteksi milik: <strong>{detectedClient}</strong>
              </div>
            )}
            {rows.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
                <AlertCircle size={14} /> Tidak ada baris valid ditemukan. Pastikan sheet punya header yang
                sesuai.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Client Tujuan *</label>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
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
                    <label className="mb-1.5 block text-sm font-medium text-foreground">Bulan *</label>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-background">
                      <tr className="border-b border-border text-muted">
                        <th className="px-2 py-2 font-medium">No</th>
                        <th className="px-2 py-2 font-medium">Pilar</th>
                        <th className="px-2 py-2 font-medium">Konten</th>
                        <th className="px-2 py-2 font-medium">Tema</th>
                        <th className="px-2 py-2 font-medium">Copy</th>
                        <th className="px-2 py-2 font-medium">Progress</th>
                        <th className="px-2 py-2 font-medium">Tgl Upload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 20).map((r) => (
                        <tr key={r.no} className="border-b border-border/50">
                          <td className="px-2 py-1.5 text-muted">{r.no}</td>
                          <td className="max-w-[120px] truncate px-2 py-1.5">{r.pilar || "-"}</td>
                          <td className="px-2 py-1.5">{r.konten || "-"}</td>
                          <td className="max-w-[120px] truncate px-2 py-1.5">{r.tema || "-"}</td>
                          <td className="max-w-[140px] truncate px-2 py-1.5 text-muted" title={r.copy}>
                            {r.copy || "-"}
                          </td>
                          <td className="px-2 py-1.5">{r.progress || "-"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5">{r.tanggal_upload || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 20 && (
                    <p className="px-2 py-2 text-center text-xs text-muted">
                      ... dan {rows.length - 20} baris lainnya
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}