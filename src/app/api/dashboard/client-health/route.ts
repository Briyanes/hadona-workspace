import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all clients with their health scores
    const { data: clients, error } = await supabase
      .from("clients")
      .select(`
        id,
        name,
        status,
        health_score,
        last_interaction_date,
        contracts!inner(status, end_date)
      `)
      .order("health_score", { ascending: true })
      .limit(20);

    if (error) throw error;

    // Categorize by health
    const atRisk = (clients || []).filter((c: any) => c.health_score !== null && c.health_score < 50);
    const needsAttention = (clients || []).filter((c: any) => c.health_score !== null && c.health_score >= 50 && c.health_score < 75);
    const healthy = (clients || []).filter((c: any) => c.health_score !== null && c.health_score >= 75);

    return NextResponse.json({
      summary: {
        total: clients?.length || 0,
        atRisk: atRisk.length,
        needsAttention: needsAttention.length,
        healthy: healthy.length,
      },
      atRiskClients: atRisk.slice(0, 5),
      needsAttentionClients: needsAttention.slice(0, 5),
    });
  } catch (err) {
    console.error("[API /dashboard/client-health] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}