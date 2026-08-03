// ============================================
// CLOUDFLARE R2 STORAGE CLIENT
// Uses S3-compatible API for R2
// ============================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Max file size for server-relay uploads (4MB to stay within Vercel limits)
export const MAX_RELAY_SIZE = 4 * 1024 * 1024;

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || "hadona-workspace";

/**
 * Generate a presigned URL for uploading a file directly from the browser to R2.
 * This keeps the R2 secret keys server-side only.
 */
export async function getUploadUrl(
  fileName: string,
  contentType: string,
  folder: string = "uploads"
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const key = `${folder}/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(R2, command, { expiresIn: 3600 });
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  return { uploadUrl, publicUrl, key };
}

/**
 * Generate a presigned URL for downloading/viewing a private file from R2.
 */
export async function getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(R2, command, { expiresIn });
}

/**
 * Upload a file buffer directly from the server to R2.
 * Used as a fallback when browser presigned URL fails (CORS).
 */
export async function uploadBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  folder: string = "uploads"
): Promise<{ publicUrl: string; key: string }> {
  const key = `${folder}/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await R2.send(command);
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  return { publicUrl, key };
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await R2.send(command);
}
