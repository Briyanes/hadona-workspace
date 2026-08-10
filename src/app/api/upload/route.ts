import { NextRequest, NextResponse } from "next/server";
import { getUploadUrl, uploadBuffer, MAX_RELAY_SIZE } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/auth-api";

const ALLOWED_FOLDERS = [
  "client-attachments",
  "weekly-report-pdfs",
  "creative-assets",
  "avatar-assets",
  "client-logos",
  "task-attachments",
  "uploads",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (presigned URL limit)

// 🔒 MIME type whitelist — blocks dangerous file types
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  "client-attachments": [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv", "text/plain", "application/zip",
  ],
  "weekly-report-pdfs": ["application/pdf"],
  "creative-assets": [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "video/mp4", "video/quicktime",
    "application/zip", "application/x-zip-compressed",
  ],
  "avatar-assets": ["image/jpeg", "image/png", "image/webp"],
  "client-logos": ["image/jpeg", "image/png", "image/svg+xml", "image/webp"],
  "task-attachments": [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv", "text/plain", "application/zip",
  ],
  "uploads": [
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf", "text/csv", "text/plain",
  ],
};

// 🔒 Dangerous extensions that should NEVER be uploaded
const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".sh", ".php", ".jsp", ".asp", ".aspx",
  ".js", ".mjs", ".html", ".htm", ".svg", // SVG can carry XSS via script tags
  ".htaccess", ".env", ".sql",
];

// 🔒 Sanitize filename: remove path traversal and dangerous characters
function sanitizeFilename(filename: string): string {
  // Remove directory traversal attempts
  const basename = filename.replace(/^.*[\\/]/, "");
  // Remove dangerous characters
  const cleaned = basename.replace(/[&;`$|<>{}()\[\]!#%^*~]/g, "_");
  // Collapse multiple underscores/dots
  return cleaned.replace(/_{2,}/g, "_").replace(/\.{2,}/g, ".").slice(0, 200);
}

// 🔒 Validate file type
function isFileTypeAllowed(folder: string, mimeType: string, filename: string): boolean {
  // First: check blocked extensions (always block, regardless of folder)
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  if (BLOCKED_EXTENSIONS.includes(ext)) return false;

  // Check MIME type against folder whitelist
  const allowed = ALLOWED_MIME_TYPES[folder] || ALLOWED_MIME_TYPES["uploads"];
  if (!allowed.includes(mimeType)) return false;

  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 uploads per minute per IP
    const rateLimited = applyRateLimit(request, "upload", 20);
    if (rateLimited) return rateLimited;

    // Verify auth
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Detect mode: FormData (server-relay) vs JSON (presigned URL) ──
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // ── MODE 2: Server-relay upload (fallback when CORS fails) ──
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const folder = (formData.get("folder") as string) || "uploads";

      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      if (!ALLOWED_FOLDERS.includes(folder)) {
        return NextResponse.json(
          { error: `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(", ")}` },
          { status: 400 }
        );
      }

      if (file.size > MAX_RELAY_SIZE) {
        return NextResponse.json(
          { error: "File too large for server-relay (max 4MB). Please retry or contact admin." },
          { status: 413 }
        );
      }

      // 🔒 Validate file type
      const safeFolder = folder;
      const safeName = sanitizeFilename(file.name);
      const safeMime = file.type || "application/octet-stream";
      if (!isFileTypeAllowed(safeFolder, safeMime, file.name)) {
        return NextResponse.json(
          { error: `File type not allowed for folder: ${folder}. File: ${file.name}` },
          { status: 415 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { publicUrl, key } = await uploadBuffer(
        buffer,
        safeName,
        safeMime,
        folder
      );

      return NextResponse.json({ publicUrl, key });
    }

    // ── MODE 1: Presigned URL request (JSON body) ──
    const body = await request.json();
    const { fileName, contentType: fileType, fileSize, folder = "uploads" } = body as {
      fileName: string;
      contentType: string;
      fileSize?: number;
      folder?: string;
    };

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: "fileName and contentType are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
      return NextResponse.json(
        { error: `Invalid folder. Allowed: ${ALLOWED_FOLDERS.join(", ")}` },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 413 }
      );
    }

    // 🔒 Validate file type
    if (!isFileTypeAllowed(folder, fileType, fileName)) {
      return NextResponse.json(
        { error: `File type not allowed for folder: ${folder}. File: ${fileName}` },
        { status: 415 }
      );
    }

    const safeFileName = sanitizeFilename(fileName);
    const { uploadUrl, publicUrl, key } = await getUploadUrl(
      safeFileName,
      fileType,
      folder
    );

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Upload failed: " + msg }, { status: 500 });
  }
}