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

      const buffer = Buffer.from(await file.arrayBuffer());
      const { publicUrl, key } = await uploadBuffer(
        buffer,
        file.name,
        file.type || "application/octet-stream",
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

    const { uploadUrl, publicUrl, key } = await getUploadUrl(
      fileName,
      fileType,
      folder
    );

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Upload failed: " + msg }, { status: 500 });
  }
}