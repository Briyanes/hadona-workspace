import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClientIP, checkRateLimit } from "@/lib/rate-limit";
import { stripUrls } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<query>
 * Global search across clients, tasks, invoices
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate limit: 30 searches per minute
    const ip = getClientIP(req);
    const rl = checkRateLimit(`search:${ip}`, 30, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many searches. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAtMs - Date.now()) / 1000)) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    // Sanitize query for ilike
    const safeQ = q.replace(/[%_]/g, "\\$&");
    const pattern = `%${safeQ}%`;

    // Define result types
    type ClientResult = { id: string; name: string; company: string | null; status: string | null };
    type TaskResult = { id: string; title: string; status: string | null; priority: string | null; due_date: string | null };
    type InvoiceResult = { id: string; invoice_number: string; status: string | null; amount: number | null; due_date: string | null };

    // Run searches in parallel
    const [clientsRes, tasksRes, invoicesRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company, status")
        .or(`name.ilike.${pattern},company.ilike.${pattern}`)
        .limit(5),
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .ilike("title", pattern)
        .limit(5),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, amount, due_date")
        .or(`invoice_number.ilike.${pattern}`)
        .limit(5),
    ]);

    const clients = (clientsRes.data || []) as unknown as ClientResult[];
    const tasks = (tasksRes.data || []) as unknown as TaskResult[];
    const invoices = (invoicesRes.data || []) as unknown as InvoiceResult[];

    const results = [
      ...clients.map((c) => ({
        type: "client" as const,
        id: c.id,
        title: c.name,
        subtitle: c.company || c.status || "",
        href: `/clients/${c.id}`,
      })),
      ...tasks.map((t) => ({
        type: "task" as const,
        id: t.id,
        title: stripUrls(t.title) || "(Link)",
        subtitle: `${t.status}${t.priority ? ` · ${t.priority}` : ""}`,
        href: `/tasks`,
      })),
      ...invoices.map((i) => ({
        type: "invoice" as const,
        id: i.id,
        title: i.invoice_number,
        subtitle: `${i.status} · Rp ${Number(i.amount || 0).toLocaleString("id-ID")}`,
        href: `/invoices`,
      })),
    ];

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[Search] Error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}