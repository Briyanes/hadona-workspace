import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data } = await (supabase
      .from("google_oauth_tokens") as unknown as {
      select: (c: string) => {
        maybeSingle: () => Promise<{ data: { refresh_token: string | null } | null }>;
      };
    }).select("refresh_token").maybeSingle();

    return NextResponse.json({
      connected: !!data,
      hasRefreshToken: !!data?.refresh_token,
    });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}