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
  "client-logos",
  "task-attachments",
  "uploads",
] as const;

export type UploadFolder = (typeof ALLOWED_FOLDERS)[number];

/**
 * Upload a file to R2.
 *
 * Strategy:
 * 1. Try presigned URL (fast, direct browser → R2)
 * 2. If CORS/network error, fallback to server-relay (browser → /api/upload → R2)
 *
 * The server-relay fallback works for files up to 4.5MB (Vercel body size limit).
 * For larger files, the CORS fix on R2 bucket is required.
 */
export async function uploadFile(
  file: File,
  folder: UploadFolder = "uploads",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  try {
    // Strategy 1: Presigned URL (preferred — fast, no server relay)
    return await uploadViaPresignedUrl(file, folder, onProgress);
  } catch (presignedError) {
    // If file is small enough, try server-relay fallback
    if (file.size <= 4 * 1024 * 1024) {
      console.warn("[Upload] Presigned URL failed, falling back to server-relay:", presignedError);
      return await uploadViaServerRelay(file, folder);
    }
    // File too large for server-relay — rethrow with helpful message
    const msg = presignedError instanceof Error ? presignedError.message : "Unknown error";
    throw new Error(
      `Direct upload failed (${msg}). File is too large for fallback. Please contact admin to fix R2 CORS settings.`
    );
  }
}

/**
 * Strategy 1: Upload via presigned URL (direct browser → R2).
 * Requires CORS to be configured on the R2 bucket.
 */
async function uploadViaPresignedUrl(
  file: File,
  folder: UploadFolder,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  // Step 1: Get presigned URL from our API
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

    xhr.onerror = () => reject(new Error("Network error during upload (likely CORS)"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(file);
  });

  return { publicUrl, key };
}

/**
 * Strategy 2: Server-relay fallback (browser → /api/upload → R2).
 * Used when presigned URL fails due to CORS.
 * Works for files ≤ 4.5MB (Vercel body limit).
 */
async function uploadViaServerRelay(
  file: File,
  folder: UploadFolder
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server upload failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const { publicUrl, key } = await res.json();
  return { publicUrl, key };
}