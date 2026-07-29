// ============================================
// CLIENT-SIDE UPLOAD HELPER
// Bridges frontend → /api/upload → R2 presigned URL
// ============================================

export interface UploadResult {
  publicUrl: string;
  key: string;
}

const ALLOWED_FOLDERS = [
  "client-attachments",
  "weekly-report-pdfs",
  "creative-assets",
  "avatar-assets",
  "task-attachments",
  "uploads",
] as const;

export type UploadFolder = (typeof ALLOWED_FOLDERS)[number];

/**
 * Upload a file to R2 via presigned URL.
 * 1. Request presigned URL from /api/upload
 * 2. PUT file directly to R2 (no server relay → fast)
 */
export async function uploadFile(
  file: File,
  folder: UploadFolder = "uploads",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  // Step 1: Get presigned URL
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      folder,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const { uploadUrl, publicUrl, key } = await res.json();

  // Step 2: Upload directly to R2
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });

  return { publicUrl, key };
}