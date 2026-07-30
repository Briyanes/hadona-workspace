import { NextRequest, NextResponse } from "next/server";
import { getUploadUrl } from "@/lib/r2";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_FOLDERS = [
  "client-attachments",
  "weekly-report-pdfs",
  "creative-assets",
  "avatar-assets",
  "client-logos",
  "task-attachments",
  "uploads",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { fileName, contentType, fileSize, folder = "uploads" } = body as {
      fileName: string;
      contentType: string;
      fileSize?: number;
      folder?: string;
    };

    if (!fileName || !contentType) {
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
      contentType,
      folder
    );

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Upload failed: " + msg }, { status: 500 });
  }
}
