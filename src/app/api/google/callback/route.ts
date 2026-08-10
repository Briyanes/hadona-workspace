import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClient } from "@/lib/google";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // user_id
  const error = url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://workspace.hadona.id";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?google_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?google_error=missing_code`
    );
  }

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("No access token returned from Google");
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || user.id !== state) {
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?google_error=auth_mismatch`
      );
    }

    const { error: upsertErr } = await (supabase
      .from("google_oauth_tokens") as unknown as {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string }
        ) => Promise<{ error: unknown }>;
      }
    ).upsert(
      {
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiry_date: tokens.expiry_date || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || "Bearer",
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) throw upsertErr;

    return NextResponse.redirect(
      `${appUrl}/settings/integrations?google_connected=1`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[google/callback] Error:", msg);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?google_error=${encodeURIComponent(msg)}`
    );
  }
}