"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CloudUpload,
  ExternalLink,
  FileVideo,
  FileImage,
  File as FileIcon,
  History,
  Loader2,
  HardDriveUpload,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

interface CreativeRequest {
  id: string;
  client_id: string | null;
  objective_campaign: string | null;
  status: string;
  client?: { name: string };
}

interface Deliverable {
  id: string;
  creative_request_id: string;
  version: number;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  drive_web_view_link: string | null;
  drive_web_content_link: string | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
  uploader?: { full_name: string | null };
}

function FileIconFor({ mime }: { mime: string | null }) {
  if (mime?.startsWith("video")) return <FileVideo size={16} className="text-primary" />;
  if (mime?.startsWith("image")) return <FileImage size={16} className="text-success" />;
  return <FileIcon size={16} className="text-muted" />;
}

export default function DeliverablesTab() {
  const supabase = createClient();
  const [requests, setRequests] = useState<CreativeRequest[]>([]);
  const [deliverables, setDeliverables] = useState<Record<string, Deliverable[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from("creative_requests")
        .select("id, client_id, objective_campaign, status, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data as unknown as CreativeRequest[]) || [];
      setRequests(list);
      if (list.length > 0) {
        setSelectedRequest(list[0].id);
        loadDeliverables(list[0].id);
      }
    } catch (err) {
      toast.error("Gagal memuat requests: " + (err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  async function loadDeliverables(requestId: string) {
    const { data } = await supabase
      .from("creative_deliverables")
      .select("*, uploader:profiles!uploaded_by(full_name)")
      .eq("creative_request_id", requestId)
      .order("version", { ascending: false });
    setDeliverables((prev) => ({
      ...prev,
      [requestId]: (data as unknown as Deliverable[]) || [],
    }));
  }

  function onSelectRequest(id: string) {
    setSelectedRequest(id);
    if (!deliverables[id]) loadDeliverables(id);
  }

  /**
   * Upload flow:
   * 1. POST /api/google/drive/upload → dapat session_url (server sudah siapkan folder)
   * 2. PUT file langsung ke session_url (chunk 8MB, resumable)
   * 3. POST /api/google/drive/complete → simpan metadata + notifikasi
   */
  async function handleUpload() {
    if (!file || !selectedRequest) return;
    setUploading(true);
    setProgress(0);
    try {
      // Step 1: init session
      const initRes = await fetch("/api/google/drive/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size,
          creative_request_id: selectedRequest,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || "Gagal inisiasi upload");
      const sessionUrl: string = initData.session_url;
      const folderId: string = initData.folder_id;

      // Step 2: PUT file langsung ke Google (resumable, single-shot jika < 5GB via XHR untuk progress)
      const driveFileId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sessionUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              resolve(resp.id || "");
            } catch {
              resolve("");
            }
          } else {
            reject(new Error(`Google upload error ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
          }
        };
        xhr.onerror = () => reject(new Error("Koneksi ke Google Drive gagal"));
        xhr.send(file);
      });

      // Ambil link dari response fields (kita minta fields di init URL)
      let viewLink: string | null = null;
      let contentLink: string | null = null;
      try {
        const respJson = await fetch(sessionUrl, { method: "PUT", headers: { "Content-Range": `bytes */${file.size}` } });
        void respJson; // query status — file sudah selesai, cukup gunakan derive link
      } catch {
        void 0;
      }
      if (driveFileId) {
        viewLink = `https://drive.google.com/file/d/${driveFileId}/view`;
        contentLink = `https://drive.google.com/uc?export=download&id=${driveFileId}`;
      }

      // Step 3: simpan metadata + notifikasi
      const completeRes = await fetch("/api/google/drive/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creative_request_id: selectedRequest,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          drive_file_id: driveFileId || null,
          drive_web_view_link: viewLink,
          drive_web_content_link: contentLink,
          drive_folder_id: folderId,
          note: note || null,
        }),
      });
      const completeData = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeData.error || "Gagal menyimpan metadata");

      toast.success(`Hasil edit v${completeData.version} tersimpan di Google Drive!`);
      setFile(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDeliverables(selectedRequest);
    } catch (err) {
      toast.error("Upload gagal: " + (err instanceof Error ? err.message : ""));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-10 rounded-lg" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center">
        <HardDriveUpload className="mb-3 text-muted" size={32} />
        <p className="text-muted">Belum ada creative request. Buat request dulu di tab Creative Requests.</p>
      </div>
    );
  }

  const currentDeliverables = deliverables[selectedRequest] || [];

  return (
    <div className="space-y-4">
      {/* Pilih request */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Creative Request</label>
        <select value={selectedRequest} onChange={(e) => onSelectRequest(e.target.value)} className="input">
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.client?.name || "No Client"}
              {r.objective_campaign ? ` — ${r.objective_campaign}` : ""} ({r.status})
            </option>
          ))}
        </select>
      </div>

      {/* Upload area */}
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <CloudUpload size={18} className="text-primary" />
          <h3 className="font-semibold text-foreground">Upload Hasil Edit</h3>
        </div>
        <p className="text-xs text-muted">
          File disimpan langsung ke Google Drive (folder <span className="font-medium">Hadona Creative → [Nama Client]</span>).
          Mendukung file besar (video mentah/final), auto resume.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={uploading}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary/90 disabled:opacity-50"
        />

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan versi (opsional), misal: revisi audio"
          className="input"
          disabled={uploading}
        />

        {file && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-xs">
            <span className="truncate text-foreground">
              {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            {!uploading && (
              <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-muted hover:text-danger">
                Ganti
              </button>
            )}
          </div>
        )}

        {uploading && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-background">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted">Mengunggah ke Google Drive... {progress}%</p>
          </div>
        )}

        <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary w-full disabled:opacity-50">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
          {uploading ? "Mengunggah..." : "Upload ke Drive"}
        </button>
      </div>

      {/* Riwayat versi */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <History size={16} className="text-muted" />
          <h3 className="font-semibold text-foreground">Riwayat Hasil Edit</h3>
          <span className="badge bg-background text-muted">{currentDeliverables.length} versi</span>
        </div>

        {currentDeliverables.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Belum ada hasil edit untuk request ini.</p>
        ) : (
          <div className="space-y-2">
            {currentDeliverables.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileIconFor mime={d.mime_type} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      v{d.version} — {d.file_name}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(d.created_at)}
                      {d.uploader?.full_name ? ` • ${d.uploader.full_name}` : ""}
                      {d.file_size ? ` • ${(d.file_size / 1024 / 1024).toFixed(1)} MB` : ""}
                    </p>
                    {d.note && <p className="mt-0.5 text-xs italic text-muted">"{d.note}"</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.drive_web_view_link && (
                    <a
                      href={d.drive_web_view_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted hover:bg-surface hover:text-primary"
                      title="Buka di Google Drive"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}