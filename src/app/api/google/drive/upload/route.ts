import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClientFromTokens, type GoogleTokenRow } from "@/lib/google";
import { google } from "googleapis";

const ROOT_FOLDER_NAME = "Hadona Creative";

/**
 * POST /api/google/drive/upload
 * Inisiasi resumable upload session ke Google Drive.
 * Body: { file_name, mime_type, file_size, creative_request_id }
 * Return: { session_url, folder_id }
 * Browser lalu PUT chunk langsung ke session_url (Google mengizinkan CORS PUT).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Load stored token (workspace-wide, sama seperti create-meet)
    const { data: tokenRow } = await (supabase
      .from("google_oauth_tokens") as unknown as {
      select: () => { maybeSingle: () => Promise<{ data: GoogleTokenRow | null }> };
    }).select().maybeSingle();

    if (!tokenRow) {
      return NextResponse.json(
        { error: "Google account not connected. Hubungkan di Settings → Integrations." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { file_name, mime_type, file_size, creative_request_id } = body as {
      file_name: string;
      mime_type: string;
      file_size: number;
      creative_request_id: string;
    };

    if (!file_name || !creative_request_id) {
      return NextResponse.json(
        { error: "file_name dan creative_request_id wajib diisi" },
        { status: 400 }
      );
    }

    // Verifikasi creative request + ambil nama client untuk struktur folder
    const { data: reqRow } = await (supabase
      .from("creative_requests") as unknown as {
      select: (_cols?: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { client_id: string | null; objective_campaign: string | null; client?: { name: string | null } | { name: string | null }[] } | null }> } };
    }).select("client_id, objective_campaign, client:clients(name)").eq("id", creative_request_id).maybeSingle();

    if (!reqRow) {
      return NextResponse.json({ error: "Creative request tidak ditemukan" }, { status: 404 });
    }

    const oauth2Client = getOAuthClientFromTokens(tokenRow);

    // Auto-refresh token jika expired — persist ke DB
    oauth2Client.on("tokens", async (newTokens) => {
      const updated: Record<string, unknown> = {
        access_token: newTokens.access_token || tokenRow.access_token,
      };
      if (newTokens.refresh_token) updated.refresh_token = newTokens.refresh_token;
      if (newTokens.expiry_date) updated.expiry_date = newTokens.expiry_date;
      await (supabase.from("google_oauth_tokens") as unknown as {
        update: (row: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      }).update(updated).eq("user_id", user.id);
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // ── Pastikan struktur folder: Root "Hadona Creative" → subfolder per client ──
    const escapeQ = (s: string) => s.replace(/([\\'])/g, "\\$1");

    const ensureFolder = async (name: string, parentId?: string, props?: Record<string, string>): Promise<string> => {
       let q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${escapeQ(name)}'`;
       if (parentId) q += ` and '${parentId}' in parents`;
       if (props) {
         for (const k of Object.keys(props)) {
           const v = props[k];
           q += ` and appProperties has { key='${k}' and value='${v}' }`;
         }
       }
       const list = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
       const existing = list.data.files?.[0]?.id;
       if (existing) return existing;
       const created = await drive.files.create({
         requestBody: {
           name,
           mimeType: "application/vnd.google-apps.folder",
           parents: parentId ? [parentId] : undefined,
           appProperties: props,
         },
         fields: "id",
       });
       return created.data.id!;
    };

    const rootId = await ensureFolder(ROOT_FOLDER_NAME, undefined, { hadona_root: "true" });
    let folderId = rootId;
    const clientObj = Array.isArray(reqRow.client) ? reqRow.client[0] : reqRow.client;
    const clientName = clientObj?.name;
    if (clientName) {
      folderId = await ensureFolder(clientName, rootId, { hadona_client_folder: "true" });
    }

    // ── Buat resumable session ──
    const { token: accessToken } = await oauth2Client.getAccessToken();
    if (!accessToken) throw new Error("Tidak bisa mendapatkan access token Google");

    const sessionRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          name: file_name,
          mimeType: mime_type || "application/octet-stream",
          parents: [folderId],
          appProperties: {
            creative_request_id,
            uploaded_by: user.id,
            source: "hadona-workspace",
          },
        }),
      }
    );

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      throw new Error(`Drive session error ${sessionRes.status}: ${errText.slice(0, 300)}`);
    }

    const sessionUrl = sessionRes.headers.get("Location") || sessionRes.headers.get("location");
    if (!sessionUrl) throw new Error("Google tidak mengembalikan session URL");

    return NextResponse.json({ session_url: sessionUrl, folder_id: folderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[google/drive/upload] Error:", msg);
    return NextResponse.json({ error: "Gagal memulai upload: " + msg }, { status: 500 });
  }
}