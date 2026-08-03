import { createClient } from "@/lib/supabase/client";

// ============================================
// CLIENT-SIDE UPLOAD HELPER
// Uses Supabase Storage (reliable, no CORS/TLS issues)
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

// Map folder names to Supabase Storage bucket names
const BUCKET_MAP: Record<UploadFolder, string> = {
  "client-attachments": "client-attachments",
  "weekly-report-pdfs": "weekly-report-pdfs",
  "creative-assets": "creative-assets",
  "avatar-assets": "avatar-assets",
  "client-logos": "client-logos",
  "task-attachments": "task-attachments",
  uploads: "uploads",
};

/**
 * Upload a file to Supabase Storage.
 *
 * This replaces the R2 presigned URL approach which had TLS handshake failures.
 * Supabase Storage is native, reliable, and handles CORS automatically.
 */
export async function uploadFile(
  file: File,
  folder: UploadFolder = "uploads",
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const supabase = createClient();
  const bucket = BUCKET_MAP[folder] || "uploads";

  // Generate unique filename
  const ext = file.name.split(".").pop() || "";
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
  const filePath = fileName;

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  if (!urlData.publicUrl) {
    throw new Error("Failed to get public URL for uploaded file");
  }

  // Track progress (Supabase doesn't support progress events natively,
  // so we simulate it for UI feedback)
  if (onProgress) {
    onProgress(100);
  }

  return {
    publicUrl: urlData.publicUrl,
    key: filePath,
  };
}